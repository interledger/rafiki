export enum OutgoingPaymentInitiationReason {
  // The outgoing payment was initiated by a card payment.
  Card = 'CARD',
  // The outgoing payment was initiated through Open Payments.
  OpenPayments = 'OPEN_PAYMENTS',
  // The outgoing payment was initiated by the Admin API.
  Admin = 'ADMIN'
}
