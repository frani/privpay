import express, { Request, Response } from 'express'
import Checkout from '../models/Checkout.js'
import User from '../models/User.js'
import { processX402Payment } from '../services/x402Service.js'

const router = express.Router()

// Middleware to get user from Privy ID
const getUserFromRequest = async (req: Request) => {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }
  const privyId = authHeader.replace('Bearer ', '')
  return await User.findOne({ privyId })
}

// POST /checkouts
router.post('/checkouts', async (req: Request, res: Response) => {
  try {
    const { name, amount } = req.body

    if (!name || !amount) {
      return res.status(400).json({ message: 'Name and amount are required' })
    }

    if (typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ message: 'Amount must be a positive number' })
    }

    const user = await getUserFromRequest(req)
    if (!user) {
      return res.status(401).json({ message: 'Unauthorized' })
    }

    const checkout = new Checkout({
      name,
      amount,
      userId: user._id,
      status: 'pending',
    })

    await checkout.save()

    res.status(201).json({
      _id: checkout._id,
      name: checkout.name,
      amount: checkout.amount,
      status: checkout.status,
      createdAt: checkout.createdAt,
    })
  } catch (error: any) {
    console.error('Create checkout error:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
})

// GET /checkouts
router.get('/checkouts', async (req: Request, res: Response) => {
  try {
    const user = await getUserFromRequest(req)
    if (!user) {
      return res.status(401).json({ message: 'Unauthorized' })
    }

    const checkouts = await Checkout.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .select('_id name amount status createdAt')

    res.json(checkouts)
  } catch (error: any) {
    console.error('Get checkouts error:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
})

// GET /checkouts/:id
router.get('/checkouts/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const checkout = await Checkout.findById(id).select(
      '_id name amount status createdAt transactionHash'
    )

    if (!checkout) {
      return res.status(404).json({ message: 'Checkout not found' })
    }

    res.json({
      _id: checkout._id,
      name: checkout.name,
      amount: checkout.amount,
      status: checkout.status,
      createdAt: checkout.createdAt,
      transactionHash: checkout.transactionHash,
    })
  } catch (error: any) {
    console.error('Get checkout error:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
})

// POST /checkouts/:id/pay - Process payment with x402
router.post('/checkouts/:id/pay', async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const checkout = await Checkout.findById(id)
    if (!checkout) {
      return res.status(404).json({ message: 'Checkout not found' })
    }

    if (checkout.status === 'completed') {
      return res.status(400).json({ message: 'Checkout already completed' })
    }

    // Process x402 payment on Polygon
    const result = await processX402Payment(checkout)

    if (result.success) {
      checkout.status = 'completed'
      checkout.transactionHash = result.transactionHash
      await checkout.save()

      res.json({
        message: 'Payment processed successfully',
        transactionHash: result.transactionHash,
      })
    } else {
      checkout.status = 'failed'
      await checkout.save()

      res.status(500).json({
        message: 'Payment processing failed',
        error: result.error,
      })
    }
  } catch (error: any) {
    console.error('Payment processing error:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
})

export default router

