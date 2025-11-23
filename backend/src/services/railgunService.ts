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
const shouldDebug = false
const useNativeArtifacts = false
const skipMerkletreeScans = true

const artifactDir = path.join(process.cwd(), 'railgun-artifacts')
const db: any = new MemoryLevel()

const artifactStore = new ArtifactStore(
  async (artifactPath: string) => {
    const fullPath = path.join(artifactDir, artifactPath)
    return new Uint8Array(await fs.readFile(fullPath))
  },
  async (dir: string, artifactPath: string, item: Uint8Array) => {
    const fullPath = path.join(artifactDir, artifactPath)
    await fs.mkdir(path.dirname(fullPath), { recursive: true })
    await fs.writeFile(fullPath, item)
  },
  async (artifactPath: string) => {
    try {
      const fullPath = path.join(artifactDir, artifactPath)
      await fs.access(fullPath)
      return true
    } catch {
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

export const ensureRailgunEngine = async (): Promise<void> => {
  if (!engineInitPromise) {
    engineInitPromise = startRailgunEngine(
      walletSource,
      db,
      shouldDebug,
      artifactStore,
      useNativeArtifacts,
      skipMerkletreeScans,
      getPoiNodeURLs()
    ).catch((error) => {
      engineInitPromise = null
      throw error
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
  await ensureRailgunEngine()

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

  const walletInfo = await createRailgunWallet(encryptionKey, mnemonic, undefined)
  const railgunAddress = walletInfo.railgunAddress
  const railgunWalletId = walletInfo.id

  const railgunPrivateKey = await getWalletMnemonic(encryptionKey, railgunWalletId)
  const railgunSpendingKey =
    (await getWalletShareableViewingKey(railgunWalletId)) || ''

  return {
    railgunAddress,
    railgunPrivateKey,
    railgunSpendingKey,
    railgunWalletId,
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
