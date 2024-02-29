import type { KeyObject } from 'crypto'
import { WebhookEventType } from './WebhookEventType'

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
  brunoEnvVar: string
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
  graphqlUrl: string
}
export interface Webhook {
  id: string
  type: WebhookEventType
  data: Record<string, unknown>
}
