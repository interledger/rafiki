import { AccessAction, AccessType } from '@interledger/open-payments'

interface BaseAccessRequest {
  actions: AccessAction[]
  identifier?: string
}

export interface IncomingPaymentRequest extends BaseAccessRequest {
  type: 'incoming-payment'
  limits?: never
}

export interface OutgoingPaymentRequest extends BaseAccessRequest {
  type: 'outgoing-payment'
  limits?: OutgoingPaymentLimit
}

export interface QuoteRequest extends BaseAccessRequest {
  type: 'quote'
  limits?: never
}

export type AccessRequest =
  | IncomingPaymentRequest
  | OutgoingPaymentRequest
  | QuoteRequest

export function isAction(actions: AccessAction[]): actions is AccessAction[] {
  if (typeof actions !== 'object') return false
  for (const action of actions) {
    if (!Object.values(AccessAction).includes(action)) return false
  }

  return true
}

export function isIncomingPaymentAccessRequest(
  accessRequest: AccessRequest
): accessRequest is IncomingPaymentRequest {
  return (
    accessRequest.type === AccessType.IncomingPayment &&
    isAction(accessRequest.actions) &&
    !accessRequest.limits
  )
}

export function isQuoteAccessRequest(
  accessRequest: AccessRequest
): accessRequest is QuoteRequest {
  return (
    accessRequest.type === AccessType.Quote &&
    isAction(accessRequest.actions) &&
    !accessRequest.limits
  )
}

// value should hold bigint, serialized as string for requests
// & storage as jsonb (postgresql.org/docs/current/datatype-json.html) field in postgres
export interface PaymentAmount {
  value: string
  assetCode: string
  assetScale: number
}

export type OutgoingPaymentLimit = {
  receiver: string
  debitAmount?: PaymentAmount
  receiveAmount?: PaymentAmount
  interval?: string
}

export type LimitData = OutgoingPaymentLimit
