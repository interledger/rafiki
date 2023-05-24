export enum PaymentPointerError {
  InvalidUrl = 'InvalidUrl',
  UnknownAsset = 'UnknownAsset',
  UnknownPaymentPointer = 'UnknownPaymentPointer'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isPaymentPointerError = (o: any): o is PaymentPointerError =>
  Object.values(PaymentPointerError).includes(o)

export const errorToCode: {
  [key in PaymentPointerError]: number
} = {
  [PaymentPointerError.InvalidUrl]: 400,
  [PaymentPointerError.UnknownAsset]: 400,
  [PaymentPointerError.UnknownPaymentPointer]: 404
}

export const errorToMessage: {
  [key in PaymentPointerError]: string
} = {
  [PaymentPointerError.InvalidUrl]: 'invalid url',
  [PaymentPointerError.UnknownAsset]: 'unknown asset',
  [PaymentPointerError.UnknownPaymentPointer]: 'unknown payment pointer'
}
