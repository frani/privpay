import express, { Request, Response } from 'express'
import { ethers } from 'ethers'
import User from '../models/User.js'
import { createRailgunWalletForUser } from '../services/railgunService.js'

const router = express.Router()

// POST /signin
router.post('/signin', async (req: Request, res: Response) => {
  try {
    const { privyId } = req.body

    console.log('Signin request payload', { privyId })

    if (!privyId) {
      return res.status(400).json({ message: 'Privy ID is required' })
    }

    let user = await User.findOne({ privyId })

    if (!user) {
      return res.status(404).json({ message: 'User not found. Please sign up first.' })
    }

    console.log("user :", {
      user: {
        id: user._id,
        privyId: user.privyId,
        name: user.name,
        email: user.email,
        walletAddress: user.walletAddress,
        railgunAddress: user.railgunAddress,
      },
    });

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
    const { privyId, email, walletAddress, name } = req.body

    console.log('Signup request payload', {
      privyId,
      email,
      walletAddress,
      name,
    })

    if (!privyId) {
      return res.status(400).json({ message: 'Privy ID is required' })
    }

    if (!name) {
      return res.status(400).json({ message: 'Name is required' })
    }

    // Check if user already exists BEFORE creating wallet
    const existingUser = await User.findOne({ privyId })
    console.log('existingUser :', existingUser);
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' })
    }

    let { railgunPrivateKey, railgunAddress, railgunSpendingKey } = req.body

    // Auto-generate Railgun wallet credentials if not supplied by the client.
    if (!railgunPrivateKey || !railgunAddress || !railgunSpendingKey) {
      console.log('[signup] generating Railgun wallet...')
      const generated = await createRailgunWalletForUser(privyId)
      console.log('[signup] wallet generated:', {
        railgunAddress: generated.railgunAddress,
        walletId: generated.railgunWalletId
      });
      railgunPrivateKey = generated.railgunPrivateKey
      railgunAddress = generated.railgunAddress
      railgunSpendingKey = generated.railgunSpendingKey
    }

    // Create new user
    const user = new User({
      privyId,
      name,
      railgunPrivateKey,
      railgunAddress,
      railgunSpendingKey,
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
    const errorMessage = error.message || 'Internal server error'
    console.error('[signup] error details:', errorMessage)
    res.status(500).json({
      message: 'Internal server error',
      error: errorMessage
    })
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

    // Get USDC contract address from environment (default: Polygon native USDC)
    const tokenAddress =
      process.env.USDC_CONTRACT_ADDRESS ||
      '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'
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
