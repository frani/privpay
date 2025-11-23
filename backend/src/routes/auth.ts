import express, { Request, Response } from 'express'
import { ethers } from 'ethers'
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

// GET /user/balance - Get merchant USDC balance
router.get('/user/balance', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authorization header required' })
    }

    const privyId = authHeader.replace('Bearer ', '')
    const user = await User.findOne({ privyId })

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    if (!user.walletAddress) {
      return res.status(400).json({ message: 'User wallet address not found' })
    }

    // Get USDC contract address from environment
    const tokenAddress = process.env.USDC_CONTRACT_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
    const rpcUrl = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com'

    // Create provider and contract
    const provider = new ethers.JsonRpcProvider(rpcUrl)
    const tokenABI = [
      'function balanceOf(address account) external view returns (uint256)',
      'function decimals() external view returns (uint8)'
    ]
    const tokenContract = new ethers.Contract(tokenAddress, tokenABI, provider)

    // Get balance
    const balance = await tokenContract.balanceOf(user.walletAddress)
    const decimals = await tokenContract.decimals()

    // Convert to human-readable format (USDC has 6 decimals)
    const balanceFormatted = ethers.formatUnits(balance, decimals)

    res.json({
      balance: balance.toString(), // Raw balance in smallest unit
      balanceFormatted: balanceFormatted, // Human-readable balance
      walletAddress: user.walletAddress,
    })
  } catch (error: any) {
    console.error('Error fetching balance:', error)
    res.status(500).json({ 
      message: 'Failed to fetch balance',
      error: error.message 
    })
  }
})

export default router

