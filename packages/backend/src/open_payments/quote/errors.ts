export enum QuoteError {
  UnknownPaymentPointer = 'UnknownPaymentPointer',
  InvalidAmount = 'InvalidAmount',
  InvalidDestination = 'InvalidDestination'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isQuoteError = (o: any): o is QuoteError =>
  Object.values(QuoteError).includes(o)

export const errorToCode: {
  [key in QuoteError]: number
} = {
  [QuoteError.UnknownPaymentPointer]: 404,
  [QuoteError.InvalidAmount]: 400,
  [QuoteError.InvalidDestination]: 400
}

export const errorToMessage: {
  [key in QuoteError]: string
} = {
  [QuoteError.UnknownPaymentPointer]: 'unknown payment pointer',
  [QuoteError.InvalidAmount]: 'invalid amount',
  [QuoteError.InvalidDestination]: 'invalid destination'
}
