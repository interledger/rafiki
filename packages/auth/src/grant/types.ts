import { Action, AccessType } from './model'
import {
  IncomingPaymentLimit,
  OutgoingPaymentLimit,
  isOutgoingPaymentLimit,
  isIncomingPaymentLimit
} from '../limit/types'

type BaseAccessRequest<Type, T> = {
  type: Type
  actions: Action[]
  locations?: string[]
  identifier?: string // TODO: do we need this?
  interval?: string
  limits: T
}

type IncomingPaymentRequest = BaseAccessRequest<
  AccessType.IncomingPayment,
  IncomingPaymentLimit
>

type OutgoingPaymentRequest = BaseAccessRequest<
  AccessType.OutgoingPayment,
  OutgoingPaymentLimit
>

type AccountRequest = BaseAccessRequest<AccessType.Account, undefined>

type QuoteRequest = BaseAccessRequest<AccessType.Quote, undefined>

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
    isIncomingPaymentLimit(accessRequest.limits)
  )
}

function isOutgoingPaymentAccessRequest(
  accessRequest: OutgoingPaymentRequest
): accessRequest is OutgoingPaymentRequest {
  return (
    accessRequest.type === AccessType.OutgoingPayment &&
    isAction(accessRequest.actions) &&
    isOutgoingPaymentLimit(accessRequest.limits)
  )
}

function isAccountAccessRequest(
  accessRequest: AccountRequest
): accessRequest is AccountRequest {
  return (
    accessRequest.type === AccessType.Account && isAction(accessRequest.actions)
  )
}

function isQuoteAccessRequest(
  accessRequest: QuoteRequest
): accessRequest is QuoteRequest {
  return (
    accessRequest.type === AccessType.Quote && isAction(accessRequest.actions)
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
