export enum QuoteError {
  UnknownPaymentPointer = 'UnknownPaymentPointer',
  InvalidAmount = 'InvalidAmount',
  InvalidReceiver = 'InvalidReceiver',
  InactivePaymentPointer = 'InactivePaymentPointer'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isQuoteError = (o: any): o is QuoteError =>
  Object.values(QuoteError).includes(o)

export const errorToCode: {
  [key in QuoteError]: number
} = {
  [QuoteError.UnknownPaymentPointer]: 404,
  [QuoteError.InvalidAmount]: 400,
  [QuoteError.InvalidReceiver]: 400,
  [QuoteError.InactivePaymentPointer]: 400
}

export const errorToMessage: {
  [key in QuoteError]: string
} = {
  [QuoteError.UnknownPaymentPointer]: 'unknown payment pointer',
  [QuoteError.InvalidAmount]: 'invalid amount',
  [QuoteError.InvalidReceiver]: 'invalid receiver',
  [QuoteError.InactivePaymentPointer]: 'inactive payment pointer'
}
