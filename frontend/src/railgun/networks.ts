import { NetworkName } from '@railgun-community/shared-models'

export type RailgunChainConfig = {
  chainId: number
  railgunNetwork: NetworkName
  rpcUrl: string
  label: string
}

const DEFAULT_RPC: Partial<Record<NetworkName, string>> = {
  [NetworkName.Polygon]: 'https://polygon-rpc.com',
  [NetworkName.Ethereum]: 'https://rpc.ankr.com/eth',
}

const polygonRpc = import.meta.env.VITE_POLYGON_RPC_URL || DEFAULT_RPC[NetworkName.Polygon]
const ethereumRpc = import.meta.env.VITE_ETHEREUM_RPC_URL || DEFAULT_RPC[NetworkName.Ethereum]
const polygonMumbaiRpc =
  import.meta.env.VITE_POLYGON_MUMBAI_RPC_URL || DEFAULT_RPC[NetworkName.PolygonMumbai]

const SUPPORTED_NETWORKS: Record<number, RailgunChainConfig> = {
  137: {
    chainId: 137,
    railgunNetwork: NetworkName.Polygon,
    rpcUrl: polygonRpc,
    label: 'Polygon',
  },
  1: {
    chainId: 1,
    railgunNetwork: NetworkName.Ethereum,
    rpcUrl: ethereumRpc,
    label: 'Ethereum',
  },
  80001: {
    chainId: 80001,
    railgunNetwork: NetworkName.PolygonMumbai,
    rpcUrl: polygonMumbaiRpc,
    label: 'Polygon Mumbai',
  },
}

export const getRailgunChainConfig = (chainId?: number): RailgunChainConfig | undefined => {
  const key = typeof chainId === 'number' ? chainId : 137
  return SUPPORTED_NETWORKS[key]
}

