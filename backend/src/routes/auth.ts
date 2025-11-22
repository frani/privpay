import express, { Request, Response } from 'express'
import User from '../models/User.js'

const router = express.Router()

// POST /signin
router.post('/signin', async (req: Request, res: Response) => {
  try {
    const { privyId } = req.body

    if (!privyId) {
      return res.status(400).json({ message: 'Privy ID is required' })
    }

    let user = await User.findOne({ privyId })

    if (!user) {
      return res.status(404).json({ message: 'User not found. Please sign up first.' })
    }

    res.json({
      message: 'Sign in successful',
      user: {
        id: user._id,
        privyId: user.privyId,
        name: user.name,
        email: user.email,
        walletAddress: user.walletAddress,
        railgunAddress: user.railgunAddress,
      },
    })
  } catch (error: any) {
    console.error('Sign in error:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
})

// POST /signup
router.post('/signup', async (req: Request, res: Response) => {
  try {
    const { privyId, email, walletAddress, name, railgunPrivateKey, railgunAddress } = req.body

    if (!privyId) {
      return res.status(400).json({ message: 'Privy ID is required' })
    }

    if (!name || !railgunPrivateKey || !railgunAddress) {
      return res.status(400).json({ 
        message: 'Name, railgunPrivateKey, and railgunAddress are required' 
      })
    }

    // Check if user already exists
    const existingUser = await User.findOne({ privyId })
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' })
    }

    // Create new user
    const user = new User({
      privyId,
      name,
      railgunPrivateKey,
      railgunAddress,
      email,
      walletAddress,
    })

    await user.save()

    res.status(201).json({
      message: 'Sign up successful',
      user: {
        id: user._id,
        privyId: user.privyId,
        name: user.name,
        email: user.email,
        walletAddress: user.walletAddress,
        railgunAddress: user.railgunAddress,
      },
    })
  } catch (error: any) {
    console.error('Sign up error:', error)
    if (error.code === 11000) {
      return res.status(400).json({ message: 'User already exists' })
    }
    res.status(500).json({ message: 'Internal server error' })
  }
})

export default router

