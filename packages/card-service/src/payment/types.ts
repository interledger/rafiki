import { AppContext } from '../app'
export interface CardDetails {
  walletAddress: string
  transactionCounter: number
  expiry: string
}

export interface PaymentBody {
  requestId: string
  card: CardDetails
  merchantWalletAddress: string
  incomingPaymentUrl: string
  date: string
  signature: string
  //  terminalCert: string
  terminalId: string
}

export type PaymentContext = Omit<AppContext, 'request'> & {
  request: Omit<AppContext['request'], 'body'> & {
    body: PaymentBody
  }
}

export enum PaymentResultEnum {
  Approved = 'approved'
}

export enum PaymentEventResultEnum {
  Completed = 'completed',
  CardExpired = 'card_expired',
  InvalidSignature = 'invalid_signature'
}

export interface PaymentEventBody {
  requestId: string
  outgoingPaymentId: string
  result: {
    code: PaymentEventResultEnum
  }
}

export interface PaymentEventParams {}

export type PaymentEventContext = Omit<AppContext, 'request'> & {
  request: Omit<AppContext['request'], 'body' | 'params'> & {
    body: PaymentEventBody
    params: PaymentEventParams
  }
}

export type PaymentResult = PaymentEventBody | void
