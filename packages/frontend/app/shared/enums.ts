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
