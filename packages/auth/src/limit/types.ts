export interface PaymentAmount {
  value: bigint
  assetCode: string
  assetScale: number
}

export interface IncomingPaymentLimit {
  incomingAmount?: PaymentAmount
  expiresAt?: string
  description?: string
  externalRef?: string
}

export type OutgoingPaymentLimit = {
  sendAmount?: PaymentAmount
  receiveAmount?: PaymentAmount
  description?: string
  externalRef?: string
} & (
  | {
      receivingAccount: string
    }
  | {
      receivingAccount?: string
      receivingPayment: string
    }
)

export type LimitData = IncomingPaymentLimit | OutgoingPaymentLimit
