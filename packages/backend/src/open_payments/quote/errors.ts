import { GraphQLErrorCode } from '../../graphql/errors'

export class QuoteError extends Error {
  public type: QuoteErrorCode
  public details?: Record<string, unknown>

  constructor(type: QuoteErrorCode, details?: Record<string, unknown>) {
    super(errorToMessage[type], details)
    this.type = type
    this.details = details
  }
}

export enum QuoteErrorCode {
  UnknownWalletAddress = 'UnknownWalletAddress',
  InvalidAmount = 'InvalidAmount',
  InvalidReceiver = 'InvalidReceiver',
  InactiveWalletAddress = 'InactiveWalletAddress',
  NonPositiveReceiveAmount = 'NonPositiveReceiveAmount',
  CouldNotFetchRates = 'CouldNotFetchRates'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isQuoteError = (o: any): o is QuoteError => o instanceof QuoteError

export const errorToHTTPCode: {
  [key in QuoteErrorCode]: number
} = {
  [QuoteErrorCode.UnknownWalletAddress]: 404,
  [QuoteErrorCode.InvalidAmount]: 400,
  [QuoteErrorCode.InvalidReceiver]: 400,
  [QuoteErrorCode.InactiveWalletAddress]: 400,
  [QuoteErrorCode.NonPositiveReceiveAmount]: 400,
  [QuoteErrorCode.CouldNotFetchRates]: 500
}

export const errorToCode: {
  [key in QuoteErrorCode]: GraphQLErrorCode
} = {
  [QuoteErrorCode.UnknownWalletAddress]: GraphQLErrorCode.NotFound,
  [QuoteErrorCode.InvalidAmount]: GraphQLErrorCode.BadUserInput,
  [QuoteErrorCode.InvalidReceiver]: GraphQLErrorCode.BadUserInput,
  [QuoteErrorCode.InactiveWalletAddress]: GraphQLErrorCode.Inactive,
  [QuoteErrorCode.NonPositiveReceiveAmount]: GraphQLErrorCode.BadUserInput,
  [QuoteErrorCode.CouldNotFetchRates]: GraphQLErrorCode.InternalServerError
}

export const errorToMessage: {
  [key in QuoteErrorCode]: string
} = {
  [QuoteErrorCode.UnknownWalletAddress]: 'unknown wallet address',
  [QuoteErrorCode.InvalidAmount]: 'invalid amount',
  [QuoteErrorCode.InvalidReceiver]: 'invalid receiver',
  [QuoteErrorCode.InactiveWalletAddress]: 'inactive wallet address',
  [QuoteErrorCode.NonPositiveReceiveAmount]: 'non-positive receive amount',
  [QuoteErrorCode.CouldNotFetchRates]: 'could not fetch exchange rates'
}
