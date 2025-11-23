import { promises as fs } from 'fs'
import path from 'path'
import { MemoryLevel } from 'memory-level'
import { ethers } from 'ethers'
import {
  ArtifactStore,
  startRailgunEngine,
} from '@railgun-community/wallet'
import { ICheckout } from '../models/Checkout.js'
import { IUser } from '../models/User.js'

/**
 * NOTE: This file wires up Railgun wallet creation for the backend.
 * It uses an in-memory LevelDB (MemoryLevel) for the engine state and persists
 * artifacts to disk under ./railgun-artifacts.
 */

// Wallet source must be alphanumeric only (no dashes or underscores).
const walletSource = 'privpaybackend'
const shouldDebug = true // Enable debug to see artifact download progress
const useNativeArtifacts = false
const skipMerkletreeScans = true

const artifactDir = path.join(process.cwd(), 'railgun-artifacts')
const db: any = new MemoryLevel()

// Ensure artifact directory exists
fs.mkdir(artifactDir, { recursive: true }).catch((err) => {
  console.warn('[railgun] Failed to create artifact directory:', err.message)
})

const artifactStore = new ArtifactStore(
  async (artifactPath: string) => {
    const fullPath = path.join(artifactDir, artifactPath)
    console.log('[railgun] Reading artifact:', artifactPath)
    try {
      return Buffer.from(await fs.readFile(fullPath))
    } catch (error: any) {
      console.error('[railgun] Failed to read artifact:', artifactPath, error.message)
      throw error
    }
  },
  async (dir: string, artifactPath: string, item: string | Uint8Array) => {
    const fullPath = path.join(artifactDir, artifactPath)
    const itemBuffer = typeof item === 'string' ? Buffer.from(item) : item
    const sizeMB = (itemBuffer.length / 1024 / 1024).toFixed(2)
    console.log('[railgun] Saving artifact:', artifactPath, `(${sizeMB} MB)`)
    try {
      await fs.mkdir(path.dirname(fullPath), { recursive: true })
      await fs.writeFile(fullPath, itemBuffer)
      console.log('[railgun] ✓ Artifact saved:', artifactPath)
    } catch (error: any) {
      console.error('[railgun] ✗ Failed to save artifact:', artifactPath, error.message)
      throw error
    }
  },
  async (artifactPath: string) => {
    try {
      const fullPath = path.join(artifactDir, artifactPath)
      await fs.access(fullPath)
      console.log('[railgun] Artifact exists:', artifactPath)
      return true
    } catch {
      console.log('[railgun] Artifact missing:', artifactPath)
      return false
    }
  }
)

const getPoiNodeURLs = (): string[] | undefined => {
  const poi = process.env.RAILGUN_POI_URL
  if (!poi) return undefined
  return [poi]
}

let engineInitPromise: Promise<void> | null = null
const walletCreationLocks = new Map<string, Promise<RailgunWalletCredentials>>()
const MOCK_RAILGUN_ADDRESS =
  '0zk1qyd4u3jhs7v4fvjdcl85sx79qcfdlf2ejlrtqq873szgecyzq60n9rv7j6fe3z53l726zevafjhqfn362r8l3vv0n44txyawncms7endasf2g26maq4ru922yd6'
const MOCK_RAILGUN_PRIVATE_KEY = 'mock-railgun-mnemonic'
const MOCK_RAILGUN_SPENDING_KEY = 'mock-railgun-spending-key'
const MOCK_RAILGUN_WALLET_ID = 'mock-railgun-wallet-id'

export const ensureRailgunEngine = async (): Promise<void> => {
  if (!engineInitPromise) {
    console.log('[railgun] engine init start')
    console.log('[railgun] artifact directory:', artifactDir)
    console.log('[railgun] This may take several minutes if artifacts need to be downloaded...')
    engineInitPromise = Promise.race([
      startRailgunEngine(
        walletSource,
        db,
        shouldDebug,
        artifactStore,
        useNativeArtifacts,
        skipMerkletreeScans,
        getPoiNodeURLs()
      ),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Railgun engine initialization timeout after 10 minutes. Artifacts may still be downloading.')), 600000)
      ),
    ]).catch((error) => {
      console.error('[railgun] engine init failed', error)
      engineInitPromise = null
      throw error
    })
    engineInitPromise.then(() => {
      console.log('[railgun] engine ready')
      console.log('[railgun] artifacts should be available now')
    })
  }
  await engineInitPromise
}

export type RailgunWalletCredentials = {
  railgunAddress: string
  railgunPrivateKey: string // storing mnemonic phrase
  railgunSpendingKey: string // shareable viewing key
  railgunWalletId: string
}

export const createRailgunWalletForUser = async (
  privyId: string
): Promise<RailgunWalletCredentials> => {
  console.log('[railgun] returning mock wallet for privyId', privyId)
  return {
    railgunAddress: MOCK_RAILGUN_ADDRESS,
    railgunPrivateKey: MOCK_RAILGUN_PRIVATE_KEY,
    railgunSpendingKey: MOCK_RAILGUN_SPENDING_KEY,
    railgunWalletId: MOCK_RAILGUN_WALLET_ID,
  }
}

/**
 * Generates a unique Railgun 0zk address for a checkout (placeholder)
 * In production, replace with proper SDK logic.
 */
export function generateCheckoutRailgunAddress(checkoutId: string, userId: string): string {
  const seed = ethers.keccak256(ethers.toUtf8Bytes(`${checkoutId}-${userId}-${Date.now()}`))
  const hash = ethers.keccak256(seed)
  const truncated = hash.slice(0, 42)
  return `0zk${truncated.slice(2)}`
}

export function isValidRailgunAddress(address: string): boolean {
  if (!address || typeof address !== 'string') {
    return false
  }
  return address.startsWith('0zk') && address.length >= 67
}

export function parse0zkAddressForContract(address0zk: string): [string, string] {
  const hash = ethers.keccak256(ethers.toUtf8Bytes(address0zk))
  return [hash, ethers.keccak256(ethers.toUtf8Bytes(`${address0zk}-2`))]
}

export async function executeShield(
  tokenAddress: string,
  amount: string,
  recipient0zk: string,
  fromAddress: string,
  signer: ethers.Signer
): Promise<{ success: boolean; transactionHash?: string; error?: string }> {
  try {
    const RAILGUN_CONTRACT_ADDRESS = process.env.RAILGUN_CONTRACT_ADDRESS
    if (!RAILGUN_CONTRACT_ADDRESS) {
      return { success: false, error: 'RAILGUN_CONTRACT_ADDRESS not configured' }
    }

    const railgunABI = [
      'function shield(bytes32[2] recipient, address token, uint256 amount) external',
      'function getShieldFee(uint256 amount) external view returns (uint256)',
    ]

    const tokenABI = [
      'function transfer(address to, uint256 amount) external returns (bool)',
      'function approve(address spender, uint256 amount) external returns (bool)',
      'function allowance(address owner, address spender) external view returns (uint256)',
      'function balanceOf(address account) external view returns (uint256)',
    ]

    const tokenContract = new ethers.Contract(tokenAddress, tokenABI, signer)
    const railgunContract = new ethers.Contract(RAILGUN_CONTRACT_ADDRESS, railgunABI, signer)

    const balance = await tokenContract.balanceOf(fromAddress)
    const amountBigInt = BigInt(amount)

    if (balance < amountBigInt) {
      return { success: false, error: `Insufficient balance: ${balance.toString()} < ${amount}` }
    }

    const fee = (amountBigInt * BigInt(25)) / BigInt(10000)
    const amountAfterFee = amountBigInt - fee

    const allowance = await tokenContract.allowance(fromAddress, RAILGUN_CONTRACT_ADDRESS)
    if (allowance < amountBigInt) {
      const approveTx = await tokenContract.approve(RAILGUN_CONTRACT_ADDRESS, ethers.MaxUint256)
      await approveTx.wait()
    }

    const recipientBytes = parse0zkAddressForContract(recipient0zk)

    const shieldTx = await railgunContract.shield(recipientBytes, tokenAddress, amountAfterFee, {
      gasLimit: 500000,
    })

    const receipt = await shieldTx.wait()

    return { success: true, transactionHash: receipt.hash }
  } catch (error: any) {
    console.error('Shield execution error:', error)
    return { success: false, error: error.message || 'Shield execution failed' }
  }
}

export async function executePrivateTransfer(
  tokenAddress: string,
  amount: string,
  from0zk: string,
  to0zk: string,
  privateKey: string
): Promise<{ success: boolean; transactionHash?: string; error?: string }> {
  try {
    return {
      success: false,
      error: 'Private transfer requires Railgun SDK implementation. This is a placeholder.',
    }
  } catch (error: any) {
    console.error('Private transfer error:', error)
    return { success: false, error: error.message || 'Private transfer failed' }
  }
}

export async function verifyCheckoutPayment(
  checkout: ICheckout,
  expectedAmount: string,
  tokenAddress: string,
  user: IUser
): Promise<boolean> {
  console.warn(
    'verifyCheckoutPayment is not implemented. Requires full Railgun SDK integration for balance queries.'
  )
  return false
}
