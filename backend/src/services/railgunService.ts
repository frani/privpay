import { promises as fs } from 'fs'
import path from 'path'
import { MemoryLevel } from 'memory-level'
import { ethers } from 'ethers'
import {
  ArtifactStore,
  createRailgunWallet,
  getWalletMnemonic,
  getWalletShareableViewingKey,
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
  // Prevent concurrent wallet creation for the same privyId
  if (walletCreationLocks.has(privyId)) {
    console.log('[railgun] wallet creation already in progress for', privyId)
    return walletCreationLocks.get(privyId)!
  }

  const creationPromise = (async () => {
    try {
      console.log('[railgun] create wallet for privyId', privyId)
      await ensureRailgunEngine()

      // Give engine a moment to fully initialize after ready signal
      console.log('[railgun] waiting for engine to be fully ready...')
      await new Promise(resolve => setTimeout(resolve, 2000))

      // Derive a deterministic 32-byte encryption key from privyId to unlock the wallet.
      // Use hex without 0x to avoid length issues.
      const encryptionKey = Buffer.from(
        ethers.getBytes(ethers.keccak256(ethers.toUtf8Bytes(`railgun-${privyId}`)))
      ).toString('hex')

      // Generate a fresh mnemonic for the wallet.
      const mnemonic = ethers.Wallet.createRandom().mnemonic?.phrase
      if (!mnemonic) {
        throw new Error('Unable to generate mnemonic for Railgun wallet')
      }

      console.log('[railgun] calling createRailgunWallet...')
      console.log('[railgun] This may take several minutes if artifacts need to be downloaded...')

      // Add progress tracking
      let progressInterval: NodeJS.Timeout | null = null
      const startTime = Date.now()

      const walletInfoPromise = createRailgunWallet(encryptionKey, mnemonic, undefined)

      // Log progress every 10 seconds
      progressInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000)
        console.log(`[railgun] Still creating wallet... (${elapsed}s elapsed)`)
        // Check if artifacts are being downloaded
        fs.readdir(artifactDir).then(files => {
          if (files.length > 0) {
            console.log(`[railgun] Found ${files.length} artifact files in directory`)
          }
        }).catch(() => { })
      }, 10000)

      const walletInfo = await Promise.race([
        walletInfoPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('createRailgunWallet timeout after 5 minutes. Artifacts may still be downloading.')), 300000)
        ),
      ]).catch((error) => {
        console.error('[railgun] createRailgunWallet error:', error)
        throw error
      }).finally(() => {
        if (progressInterval) {
          clearInterval(progressInterval)
        }
      })

      console.log('[railgun] wallet created', { privyId, walletId: walletInfo.id })
      const railgunAddress = walletInfo.railgunAddress
      const railgunWalletId = walletInfo.id

      console.log('[railgun] getting wallet mnemonic...')
      const railgunPrivateKey = await getWalletMnemonic(encryptionKey, railgunWalletId)
      console.log('[railgun] getting shareable viewing key...')
      const railgunSpendingKey =
        (await getWalletShareableViewingKey(railgunWalletId)) || ''

      return {
        railgunAddress,
        railgunPrivateKey,
        railgunSpendingKey,
        railgunWalletId,
      }
    } finally {
      walletCreationLocks.delete(privyId)
    }
  })()

  walletCreationLocks.set(privyId, creationPromise)
  return creationPromise
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
