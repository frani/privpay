/// <reference types="vite/client" />

declare module '*.png' {
  const value: string
  export default value
}

declare module '*.jpg' {
  const value: string
  export default value
}

declare module '*.jpeg' {
  const value: string
  export default value
}

declare module '*.svg' {
  const value: string
  export default value
}

declare module '*.gif' {
  const value: string
  export default value
}

declare module '*.webp' {
  const value: string
  export default value
}

// Type declarations for packages that may not have types
declare module 'browser-level' {
  export class BrowserLevel {
    constructor(name: string)
    [key: string]: any
  }
}

declare module 'localforage' {
  const localforage: {
    getItem<T = any>(key: string): Promise<T | null>
    setItem<T = any>(key: string, value: T): Promise<T>
    removeItem(key: string): Promise<void>
    clear(): Promise<void>
    length(): Promise<number>
    key(index: number): Promise<string | null>
    keys(): Promise<string[]>
    iterate<T>(iteratee: (value: any, key: string, iterationNumber: number) => T | void): Promise<T | void>
  }
  export default localforage
}

declare module '@railgun-community/wallet' {
  export class ArtifactStore {
    constructor(
      get: (path: string) => Promise<any>,
      put: (dir: string, path: string, item: Uint8Array) => Promise<void>,
      exists: (path: string) => Promise<boolean>
    )
  }
  export function loadProvider(config: any, network: string): Promise<any>
  export function startRailgunEngine(
    walletSource: string,
    db: any,
    shouldDebug: boolean,
    artifactStore: ArtifactStore,
    useNativeArtifacts: boolean,
    skipMerkletreeScans: boolean,
    poiNodeURLs?: string[]
  ): Promise<void>
  export function getShieldPrivateKeySignatureMessage(): string
}

declare module '@railgun-community/wallet/dist/services/transactions/tx-shield' {
  export function populateShield(
    txVersion: any,
    network: string,
    shieldPrivateKey: string,
    recipients: any[],
    nftRecipients: any[]
  ): Promise<{ serializedTransaction?: string; error?: string }>
}

declare module '@railgun-community/shared-models' {
  export type NetworkName = string
  export type TXIDVersion = any
  export type RailgunERC20AmountRecipient = {
    tokenAddress: string
    amountString: string
    recipientAddress: string
  }
  export type FallbackProviderJsonConfig = {
    chainId: number
    providers: Array<{
      provider: string
      priority: number
      weight: number
    }>
  }
  export const NETWORK_CONFIG: Record<string, {
    chain: { id: number }
    supportsV3: boolean
  }>
  export function deserializeTransaction(
    serializedTransaction: string,
    undefined: undefined,
    chainId: number
  ): any
}

