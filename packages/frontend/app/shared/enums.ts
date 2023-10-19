export enum WebhookEventType {
  IncomingPaymentCreated = 'incoming_payment.created',
  IncomingPaymentCompleted = 'incoming_payment.completed',
  IncomingPaymentExpired = 'incoming_payment.expired',
  OutgoingPaymentCreated = 'outgoing_payment.created',
  OutgoingPaymentCompleted = 'outgoing_payment.completed',
  OutgoingPaymentFailed = 'outgoing_payment.failed',
  PaymentPointerNotFound = 'payment_pointer.not_found',
  AssetLiquidityLow = 'asset.liquidity_low',
  PeerLiquidityLow = 'peer.liquidity_low'
}
