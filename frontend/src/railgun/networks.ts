// Using string type instead of NetworkName to avoid type issues
type NetworkName = string

export type RailgunChainConfig = {
  chainId: number
  railgunNetwork: NetworkName
  rpcUrl: string
  label: string
}

const DEFAULT_RPC: Partial<Record<string, string>> = {
  Polygon: 'https://polygon-rpc.com',
  Ethereum: 'https://rpc.ankr.com/eth',
  PolygonMumbai: 'https://rpc.ankr.com/polygon_mumbai',
}

const polygonRpc = import.meta.env.VITE_POLYGON_RPC_URL || DEFAULT_RPC['Polygon']
const ethereumRpc = import.meta.env.VITE_ETHEREUM_RPC_URL || DEFAULT_RPC['Ethereum']
const polygonMumbaiRpc =
  import.meta.env.VITE_POLYGON_MUMBAI_RPC_URL || DEFAULT_RPC['PolygonMumbai']

const SUPPORTED_NETWORKS: Record<number, RailgunChainConfig> = {
  137: {
    chainId: 137,
    railgunNetwork: 'Polygon',
    rpcUrl: polygonRpc || '',
    label: 'Polygon',
  },
  1: {
    chainId: 1,
    railgunNetwork: 'Ethereum',
    rpcUrl: ethereumRpc || '',
    label: 'Ethereum',
  },
  80001: {
    chainId: 80001,
    railgunNetwork: 'PolygonMumbai',
    rpcUrl: polygonMumbaiRpc || '',
    label: 'Polygon Mumbai',
  },
}

export const getRailgunChainConfig = (chainId?: number): RailgunChainConfig | undefined => {
  const key = typeof chainId === 'number' ? chainId : 137
  return SUPPORTED_NETWORKS[key]
}

