export enum AccessType {
  Account = 'account',
  IncomingPayment = 'incoming-payment',
  OutgoingPayment = 'outgoing-payment',
  Quote = 'quote'
}

export enum Action {
  Create = 'create',
  Read = 'read',
  List = 'list',
  Complete = 'complete'
}

interface BaseAccessRequest {
  actions: Action[]
  locations?: string[]
  identifier?: string
  interval?: string
}

interface IncomingPaymentRequest extends BaseAccessRequest {
  type: AccessType.IncomingPayment
  limits?: IncomingPaymentLimit
}

interface OutgoingPaymentRequest extends BaseAccessRequest {
  type: AccessType.OutgoingPayment
  limits?: OutgoingPaymentLimit
}

interface AccountRequest extends BaseAccessRequest {
  type: AccessType.Account
  limits?: undefined
}

interface QuoteRequest extends BaseAccessRequest {
  type: AccessType.Quote
  limits?: undefined
}

export type AccessRequest =
  | IncomingPaymentRequest
  | OutgoingPaymentRequest
  | AccountRequest
  | QuoteRequest

export function isAccessType(accessType: AccessType): accessType is AccessType {
  return Object.values(AccessType).includes(accessType)
}

export function isAction(actions: Action[]): actions is Action[] {
  if (typeof actions !== 'object') return false
  for (const action of actions) {
    if (!Object.values(Action).includes(action)) return false
  }

  return true
}

function isIncomingPaymentAccessRequest(
  accessRequest: IncomingPaymentRequest
): accessRequest is IncomingPaymentRequest {
  return (
    accessRequest.type === AccessType.IncomingPayment &&
    isAction(accessRequest.actions) &&
    (!accessRequest.limits || isIncomingPaymentLimit(accessRequest.limits))
  )
}

function isOutgoingPaymentAccessRequest(
  accessRequest: OutgoingPaymentRequest
): accessRequest is OutgoingPaymentRequest {
  return (
    accessRequest.type === AccessType.OutgoingPayment &&
    isAction(accessRequest.actions) &&
    (!accessRequest.limits || isOutgoingPaymentLimit(accessRequest.limits))
  )
}

function isAccountAccessRequest(
  accessRequest: AccountRequest
): accessRequest is AccountRequest {
  return (
    accessRequest.type === AccessType.Account &&
    isAction(accessRequest.actions) &&
    !accessRequest.limits
  )
}

function isQuoteAccessRequest(
  accessRequest: QuoteRequest
): accessRequest is QuoteRequest {
  return (
    accessRequest.type === AccessType.Quote &&
    isAction(accessRequest.actions) &&
    !accessRequest.limits
  )
}

export function isAccessRequest(
  accessRequest: AccessRequest
): accessRequest is AccessRequest {
  return (
    isIncomingPaymentAccessRequest(accessRequest as IncomingPaymentRequest) ||
    isOutgoingPaymentAccessRequest(accessRequest as OutgoingPaymentRequest) ||
    isAccountAccessRequest(accessRequest as AccountRequest) ||
    isQuoteAccessRequest(accessRequest as QuoteRequest)
  )
}

// value should hold bigint, serialized as string for requests
// & storage as jsonb (postgresql.org/docs/current/datatype-json.html) field in postgres
export interface PaymentAmount {
  value: string
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
