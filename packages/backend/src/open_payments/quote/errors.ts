import { GraphQLErrorCode } from '../../graphql/errors'

export class QuoteError extends Error {
  public type: QuoteErrorType
  public details?: Record<string, unknown>

  constructor(type: QuoteErrorType, details?: Record<string, unknown>) {
    super(errorToMessage[type], details)
    this.type = type
    this.details = details
  }
}

export enum QuoteErrorType {
  UnknownWalletAddress = 'UnknownWalletAddress',
  InvalidAmount = 'InvalidAmount',
  InvalidReceiver = 'InvalidReceiver',
  InactiveWalletAddress = 'InactiveWalletAddress',
  NonPositiveReceiveAmount = 'NonPositiveReceiveAmount'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isQuoteError = (o: any): o is QuoteError => o instanceof QuoteError

export const errorToHTTPCode: {
  [key in QuoteErrorType]: number
} = {
  [QuoteErrorType.UnknownWalletAddress]: 404,
  [QuoteErrorType.InvalidAmount]: 400,
  [QuoteErrorType.InvalidReceiver]: 400,
  [QuoteErrorType.InactiveWalletAddress]: 400,
  [QuoteErrorType.NonPositiveReceiveAmount]: 400
}

export const errorToCode: {
  [key in QuoteErrorType]: GraphQLErrorCode
} = {
  [QuoteErrorType.UnknownWalletAddress]: GraphQLErrorCode.NotFound,
  [QuoteErrorType.InvalidAmount]: GraphQLErrorCode.BadUserInput,
  [QuoteErrorType.InvalidReceiver]: GraphQLErrorCode.BadUserInput,
  [QuoteErrorType.InactiveWalletAddress]: GraphQLErrorCode.Inactive,
  [QuoteErrorType.NonPositiveReceiveAmount]: GraphQLErrorCode.BadUserInput
}

export const errorToMessage: {
  [key in QuoteErrorType]: string
} = {
  [QuoteErrorType.UnknownWalletAddress]: 'unknown wallet address',
  [QuoteErrorType.InvalidAmount]: 'invalid amount',
  [QuoteErrorType.InvalidReceiver]: 'invalid receiver',
  [QuoteErrorType.InactiveWalletAddress]: 'inactive wallet address',
  [QuoteErrorType.NonPositiveReceiveAmount]: 'non-positive receive amount'
}
