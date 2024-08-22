import { GraphQLErrorCode } from '../../../graphql/errors'

export enum IncomingPaymentError {
  UnknownWalletAddress = 'UnknownWalletAddress',
  InvalidAmount = 'InvalidAmount',
  UnknownPayment = 'UnknownPayment',
  InvalidState = 'InvalidState',
  InvalidExpiry = 'InvalidExpiry',
  WrongState = 'WrongState',
  InactiveWalletAddress = 'InactiveWalletAddress',
  ActionNotPerformed = 'ActionNotPerformed',
  AlreadyActioned = 'AlreadyActioned'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isIncomingPaymentError = (o: any): o is IncomingPaymentError =>
  Object.values(IncomingPaymentError).includes(o)

export const errorToHTTPCode: {
  [key in IncomingPaymentError]: number
} = {
  [IncomingPaymentError.UnknownWalletAddress]: 404,
  [IncomingPaymentError.InvalidAmount]: 400,
  [IncomingPaymentError.UnknownPayment]: 404,
  [IncomingPaymentError.InvalidState]: 400,
  [IncomingPaymentError.InvalidExpiry]: 400,
  [IncomingPaymentError.WrongState]: 409,
  [IncomingPaymentError.InactiveWalletAddress]: 400,
  [IncomingPaymentError.ActionNotPerformed]: 403,
  [IncomingPaymentError.AlreadyActioned]: 403
}

export const errorToCode: {
  [key in IncomingPaymentError]: GraphQLErrorCode
} = {
  [IncomingPaymentError.UnknownWalletAddress]: GraphQLErrorCode.NotFound,
  [IncomingPaymentError.InvalidAmount]: GraphQLErrorCode.BadUserInput,
  [IncomingPaymentError.UnknownPayment]: GraphQLErrorCode.NotFound,
  [IncomingPaymentError.InvalidState]: GraphQLErrorCode.BadUserInput,
  [IncomingPaymentError.InvalidExpiry]: GraphQLErrorCode.BadUserInput,
  [IncomingPaymentError.WrongState]: GraphQLErrorCode.Conflict,
  [IncomingPaymentError.InactiveWalletAddress]: GraphQLErrorCode.Inactive,
  [IncomingPaymentError.ActionNotPerformed]: GraphQLErrorCode.Timeout,
  [IncomingPaymentError.AlreadyActioned]: GraphQLErrorCode.Forbidden
}

export const errorToMessage: {
  [key in IncomingPaymentError]: string
} = {
  [IncomingPaymentError.UnknownWalletAddress]: 'unknown wallet address',
  [IncomingPaymentError.InvalidAmount]: 'invalid amount',
  [IncomingPaymentError.UnknownPayment]: 'unknown payment',
  [IncomingPaymentError.InvalidState]: 'invalid state',
  [IncomingPaymentError.InvalidExpiry]: 'invalid expiresAt',
  [IncomingPaymentError.WrongState]: 'wrong state',
  [IncomingPaymentError.InactiveWalletAddress]: 'inactive wallet address',
  [IncomingPaymentError.ActionNotPerformed]: 'action not performed',
  [IncomingPaymentError.AlreadyActioned]: 'action already performed'
}
