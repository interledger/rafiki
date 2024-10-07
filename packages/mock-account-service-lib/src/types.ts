import type { KeyObject } from 'crypto'

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

export interface Fee {
  fixed: number
  basisPoints: number
  asset: string
  scale: number
}

export interface SeedInstance {
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
  idpSecret: string
}
export interface Webhook {
  id: string
  type: WebhookEventType
  data: Record<string, unknown>
}

export enum WebhookEventType {
  IncomingPaymentCreated = 'INCOMING_PAYMENT_CREATED',
  IncomingPaymentCompleted = 'INCOMING_PAYMENT_COMPLETED',
  IncomingPaymentExpired = 'INCOMING_PAYMENT_EXPIRED',
  OutgoingPaymentCreated = 'OUTGOING_PAYMENT_CREATED',
  OutgoingPaymentCompleted = 'OUTGOING_PAYMENT_COMPLETED',
  OutgoingPaymentFailed = 'OUTGOING_PAYMENT_FAILED',
  WalletAddressWebMonetization = 'WALLET_ADDRESS_WEB_MONETIZATION',
  WalletAddressNotFound = 'WALLET_ADDRESS_NOT_FOUND',
  AssetLiquidityLow = 'ASSET_LIQUIDITY_LOW',
  PeerLiquidityLow = 'PEER_LIQUIDITY_LOW'
}
