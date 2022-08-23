export enum PaymentPointerError {
  InvalidUrl = 'InvalidUrl'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isPaymentPointerError = (o: any): o is PaymentPointerError =>
  Object.values(PaymentPointerError).includes(o)

export const errorToCode: {
  [key in PaymentPointerError]: number
} = {
  [PaymentPointerError.InvalidUrl]: 400
}

export const errorToMessage: {
  [key in PaymentPointerError]: string
} = {
  [PaymentPointerError.InvalidUrl]: 'invalid url'
}
