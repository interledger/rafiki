import { Action, AccessType } from './model'
import { IncomingPaymentLimit, OutgoingPaymentLimit } from '../limit/types'

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
