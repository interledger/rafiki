export enum QuoteError {
  UnknownWalletAddress = 'UnknownWalletAddress',
  InvalidAmount = 'InvalidAmount',
  InvalidReceiver = 'InvalidReceiver',
  InactiveWalletAddress = 'InactiveWalletAddress',
  NegativeReceiveAmount = 'NegativeReceiveAmount'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isQuoteError = (o: any): o is QuoteError =>
  Object.values(QuoteError).includes(o)

export const errorToCode: {
  [key in QuoteError]: number
} = {
  [QuoteError.UnknownWalletAddress]: 404,
  [QuoteError.InvalidAmount]: 400,
  [QuoteError.InvalidReceiver]: 400,
  [QuoteError.InactiveWalletAddress]: 400,
  [QuoteError.NegativeReceiveAmount]: 400
}

export const errorToMessage: {
  [key in QuoteError]: string
} = {
  [QuoteError.UnknownWalletAddress]: 'unknown wallet address',
  [QuoteError.InvalidAmount]: 'invalid amount',
  [QuoteError.InvalidReceiver]: 'invalid receiver',
  [QuoteError.InactiveWalletAddress]: 'inactive wallet address',
  [QuoteError.NegativeReceiveAmount]: 'negative receive amount'
}
