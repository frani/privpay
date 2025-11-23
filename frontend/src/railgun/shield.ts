import { BrowserLevel } from 'browser-level'
import localforage from 'localforage'
import { ethers, type TransactionRequest } from 'ethers'
import {
  ArtifactStore,
  loadProvider,
  startRailgunEngine,
} from '@railgun-community/wallet'
import {
  getShieldPrivateKeySignatureMessage,
  populateShield,
} from '@railgun-community/wallet/dist/services/transactions/tx-shield'
import {
  FallbackProviderJsonConfig,
  NETWORK_CONFIG,
  RailgunERC20AmountRecipient,
  TXIDVersion,
  deserializeTransaction,
} from '@railgun-community/shared-models'
import { getRailgunChainConfig, type RailgunChainConfig } from './networks'

const walletSource = 'privpayapp'
const useNativeArtifacts = false
const skipMerkletreeScans = true
const shouldDebug = false

const db = new BrowserLevel('privpay-railgun')

const artifactStore = new ArtifactStore(
  async (path) => localforage.getItem(path),
  async (_dir, path, item) => {
    await localforage.setItem(path, item)
  },
  async (path) => (await localforage.getItem(path)) != null
)

let engineInitPromise: Promise<void> | null = null
const providerPromises = new Map<string, Promise<void>>()

const getPoiNodeURLs = (): string[] | undefined => {
  const poi = import.meta.env.VITE_RAILGUN_POI_URL
  if (!poi) return undefined
  return [poi]
}

const startEngine = async () => {
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

const ensureProviderForNetwork = async (config: RailgunChainConfig) => {
  const cacheKey = `${config.railgunNetwork}`
  let promise = providerPromises.get(cacheKey)
  if (!promise) {
    const fallbackConfig: FallbackProviderJsonConfig = {
      chainId: config.chainId,
      providers: [
        {
          provider: config.rpcUrl,
          priority: 1,
          weight: 1,
        },
      ],
    }
    promise = loadProvider(fallbackConfig, config.railgunNetwork)
    providerPromises.set(cacheKey, promise)
  }
  await promise
}

export const ensureRailgunReady = async (chainId?: number): Promise<RailgunChainConfig> => {
  const config = getRailgunChainConfig(chainId)
  if (!config) {
    throw new Error('Unsupported network for Railgun shielding')
  }
  await startEngine()
  await ensureProviderForNetwork(config)
  return config
}

export const deriveShieldPrivateKey = async (signer: ethers.Signer): Promise<string> => {
  const signature = await signer.signMessage(getShieldPrivateKeySignatureMessage())
  return ethers.keccak256(signature)
}

const resolveTxVersion = (networkName: keyof typeof NETWORK_CONFIG): TXIDVersion => {
  const network = NETWORK_CONFIG[networkName]
  return network.supportsV3 ? TXIDVersion.V3_PoseidonMerkle : TXIDVersion.V2_PoseidonMerkle
}

export type ShieldTransactionParams = {
  config: RailgunChainConfig
  shieldPrivateKey: string
  tokenAddress: string
  amount: bigint
  recipientAddress: string
}

export const buildShieldTransactionRequest = async ({
  config,
  shieldPrivateKey,
  tokenAddress,
  amount,
  recipientAddress,
}: ShieldTransactionParams): Promise<TransactionRequest> => {
  if (amount <= 0) {
    throw new Error('Shield amount must be greater than zero')
  }

  const recipients: RailgunERC20AmountRecipient[] = [
    {
      tokenAddress,
      amountString: ethers.toBeHex(amount),
      recipientAddress,
    },
  ]

  const txVersion = resolveTxVersion(config.railgunNetwork)
  const { serializedTransaction, error } = await populateShield(
    txVersion,
    config.railgunNetwork,
    shieldPrivateKey,
    recipients,
    []
  )

  if (error || !serializedTransaction) {
    throw new Error(error || 'Unable to populate shield transaction')
  }

  const { chain } = NETWORK_CONFIG[config.railgunNetwork]
  return deserializeTransaction(serializedTransaction, undefined, chain.id)
}

