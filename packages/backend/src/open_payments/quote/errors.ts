import { GraphQLErrorCode } from '../../graphql/errors'

export enum QuoteError {
  UnknownWalletAddress = 'UnknownWalletAddress',
  InvalidAmount = 'InvalidAmount',
  InvalidReceiver = 'InvalidReceiver',
  InactiveWalletAddress = 'InactiveWalletAddress',
  NonPositiveReceiveAmount = 'NonPositiveReceiveAmount'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isQuoteError = (o: any): o is QuoteError =>
  Object.values(QuoteError).includes(o)

export const errorToHTTPCode: {
  [key in QuoteError]: number
} = {
  [QuoteError.UnknownWalletAddress]: 404,
  [QuoteError.InvalidAmount]: 400,
  [QuoteError.InvalidReceiver]: 400,
  [QuoteError.InactiveWalletAddress]: 400,
  [QuoteError.NonPositiveReceiveAmount]: 400
}

export const errorToCode: {
  [key in QuoteError]: GraphQLErrorCode
} = {
  [QuoteError.UnknownWalletAddress]: GraphQLErrorCode.NotFound,
  [QuoteError.InvalidAmount]: GraphQLErrorCode.BadUserInput,
  [QuoteError.InvalidReceiver]: GraphQLErrorCode.BadUserInput,
  [QuoteError.InactiveWalletAddress]: GraphQLErrorCode.Inactive,
  [QuoteError.NonPositiveReceiveAmount]: GraphQLErrorCode.BadUserInput
}

export const errorToMessage: {
  [key in QuoteError]: string
} = {
  [QuoteError.UnknownWalletAddress]: 'unknown wallet address',
  [QuoteError.InvalidAmount]: 'invalid amount',
  [QuoteError.InvalidReceiver]: 'invalid receiver',
  [QuoteError.InactiveWalletAddress]: 'inactive wallet address',
  [QuoteError.NonPositiveReceiveAmount]: 'non-positive receive amount'
}
