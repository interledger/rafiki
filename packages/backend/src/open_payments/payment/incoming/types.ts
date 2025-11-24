export enum IncomingPaymentInitiationReason {
  // The incoming payment was initiated by a card payment.
  Card = 'CARD',
  // The incoming payemnt was initiated through Open Payments.
  OpenPayments = 'OPEN_PAYMENTS',
  // The incoming payment was initiated by the Admin API.
  Admin = 'ADMIN'
}
