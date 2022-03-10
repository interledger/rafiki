import * as Pay from '@interledger/pay'

import { TransferError } from '../../../accounting/errors'

export enum OutgoingPaymentError {
  UnknownAccount = 'UnknownAccount',
  UnknownPayment = 'UnknownPayment',
  WrongState = 'WrongState',
  InvalidAmount = 'InvalidAmount',
  InvalidDestination = 'InvalidDestination'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isOutgoingPaymentError = (o: any): o is OutgoingPaymentError =>
  Object.values(OutgoingPaymentError).includes(o)

export const FundingError = { ...OutgoingPaymentError, ...TransferError }
export type FundingError = OutgoingPaymentError | TransferError

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isFundingError = (o: any): o is FundingError =>
  Object.values(FundingError).includes(o)

export type PaymentError = LifecycleError | Pay.PaymentError

export enum LifecycleError {
  // Rate fetch failed.
  PricesUnavailable = 'PricesUnavailable',
  // Edge error due to retries, partial payment, and database write errors.
  BadState = 'BadState',
  // Account asset conflicts with sendAmount asset
  SourceAssetConflict = 'SourceAssetConflict',

  // These errors shouldn't ever trigger (impossible states), but they exist to satisfy types:
  MissingBalance = 'MissingBalance',
  MissingQuote = 'MissingQuote',
  MissingExpiration = 'MissingExpiration',
  MissingSendAmount = 'MissingSendAmount',
  MissingReceiveAmount = 'MissingReceiveAmount',
  MissingIncomingPayment = 'MissingIncomingPayment',
  InvalidRatio = 'InvalidRatio',
  Unauthorized = 'Unauthorized'
}

const retryablePaymentErrors: { [paymentError in PaymentError]?: boolean } = {
  // Lifecycle errors
  PricesUnavailable: true,
  // From @interledger/pay's PaymentError:
  QueryFailed: true,
  ConnectorError: true,
  EstablishmentFailed: true,
  InsufficientExchangeRate: true,
  RateProbeFailed: true,
  IdleTimeout: true,
  ClosedByReceiver: true
}

export function canRetryError(err: Error | PaymentError): boolean {
  return err instanceof Error || !!retryablePaymentErrors[err]
}
