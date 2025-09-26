import { AppContext } from '../app'
export interface CardDetails {
  walletAddress: string
  signature: string
}

interface Amount {
  value: string
  assetScale: number
  assetCode: string
}

export interface PaymentBody {
  requestId: string
  signature: string
  payload: string
  amount: Amount
  senderWalletAddress: string
  incomingPaymentUrl: string
  timestamp: number
}

export type PaymentContext = Omit<AppContext, 'request'> & {
  request: Omit<AppContext['request'], 'body'> & {
    body: PaymentBody
  }
}

export enum PaymentResultCode {
  Approved = 'approved',
  InvalidSignature = 'invalid_signature'
}

export enum PaymentErrorCode {
  InvalidRequest = 'invalid_request'
}

export enum PaymentEventType {
  Funded = 'outgoing_payment.funded',
  Cancelled = 'outgoing_payment.cancelled'
}

export enum PaymentCancellationReason {
  InvalidSignature = 'invalid_signature',
  InvalidRequest = 'invalid_request'
}

export interface PaymentEventCardDetails {
  requestId?: string
  initiatedAt?: string
  data?: Record<string, unknown>
}

export interface PaymentEventMetadata extends Record<string, unknown> {
  cardPaymentFailureReason?: PaymentCancellationReason | string
}

export interface PaymentEventData {
  id: string
  cardDetails?: PaymentEventCardDetails
  metadata?: PaymentEventMetadata
}

export interface PaymentEventBody {
  id: string
  type: PaymentEventType | string
  data: PaymentEventData
}

export interface PaymentSuccessResult {
  requestId: string
  result: {
    code: PaymentResultCode
    description?: string
  }
}

export interface PaymentErrorResult {
  error: {
    code: PaymentErrorCode
    description: string
  }
}


export interface PaymentEventParams {}

export type PaymentEventContext = Omit<AppContext, 'request'> & {
  request: Omit<AppContext['request'], 'body' | 'params'> & {
    body: PaymentEventBody
    params: PaymentEventParams
  }
}

export type PaymentResult = PaymentSuccessResult | PaymentErrorResult
