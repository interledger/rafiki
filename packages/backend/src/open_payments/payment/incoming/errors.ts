export enum IncomingPaymentError {
  UnknownAccount = 'UnknownAccount',
  InvalidAmount = 'InvalidAmount'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isIncomingPaymentError = (o: any): o is IncomingPaymentError =>
  Object.values(IncomingPaymentError).includes(o)

export const errorToCode: {
  [key in IncomingPaymentError]: number
} = {
  [IncomingPaymentError.UnknownAccount]: 404,
  [IncomingPaymentError.InvalidAmount]: 400
}

export const errorToMessage: {
  [key in IncomingPaymentError]: string
} = {
  [IncomingPaymentError.UnknownAccount]: 'unknown account',
  [IncomingPaymentError.InvalidAmount]: 'invalid amount'
}
