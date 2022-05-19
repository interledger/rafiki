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
      receivingPayment?: string
    }
  | {
      receivingAccount?: string
      receivingPayment: string
    }
)

export type LimitData = IncomingPaymentLimit | OutgoingPaymentLimit

function isPaymentAmount(
  paymentAmount: PaymentAmount | undefined
): paymentAmount is PaymentAmount {
  return (
    paymentAmount?.value !== undefined &&
    paymentAmount?.assetCode !== undefined &&
    paymentAmount?.assetScale !== undefined
  )
}

export function isIncomingPaymentLimit(
  limit: IncomingPaymentLimit
): limit is IncomingPaymentLimit {
  return (
    typeof limit.expiresAt === 'string' &&
    typeof limit.description === 'string' &&
    typeof limit.externalRef === 'string' &&
    isPaymentAmount(limit.incomingAmount)
  )
}

export function isOutgoingPaymentLimit(
  limit: OutgoingPaymentLimit
): limit is OutgoingPaymentLimit {
  return (
    typeof limit.description === 'string' &&
    typeof limit.externalRef === 'string' &&
    isPaymentAmount(limit.sendAmount) &&
    isPaymentAmount(limit.receiveAmount) &&
    ((!limit.receivingAccount &&
      limit.receivingPayment !== undefined &&
      typeof limit.receivingPayment === 'string') ||
      typeof limit.receivingAccount === 'string')
  )
}
