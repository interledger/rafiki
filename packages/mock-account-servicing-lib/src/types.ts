import type { KeyObject } from 'crypto'

interface Self {
  graphqlUrl: string
  hostname: string
  mapHostname: string
  openPaymentPublishedPort: number
}

interface Asset {
  code: string
  scale: number
  liquidity: number
  liquidityThreshold: number
}

export interface Peering {
  liquidityThreshold: number
  peerUrl: string
  peerIlpAddress: string
  initialLiquidity: string
  name: string
}

export interface Account {
  name: string
  id: string
  initialBalance: bigint
  path: string
  postmanEnvVar: string
  assetCode: string
  skipWalletAddressCreation?: boolean
}

interface Fee {
  fixed: number
  basisPoints: number
  asset: string
  scale: number
}

interface SeedInstance {
  self: Self
  assets: Array<Asset>
  peeringAsset: string
  peers: Array<Peering>
  accounts: Array<Account>
  fees: Array<Fee>
  rates: Record<string, Record<string, number>>
}

export interface Config {
  seed: SeedInstance
  key: KeyObject
  publicHost: string
  testnetAutoPeerUrl: string
  authServerDomain: string
}
