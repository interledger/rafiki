export enum FeeError {
  UnknownAsset = 'UnknownAsset',
  InvalidFee = 'InvalidFee'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isFeeError = (o: any): o is FeeError =>
  Object.values(FeeError).includes(o)

export const errorToCode: {
  [key in FeeError]: number
} = {
  [FeeError.UnknownAsset]: 404,
  [FeeError.InvalidFee]: 422
}

export const errorToMessage: {
  [key in FeeError]: string
} = {
  [FeeError.UnknownAsset]: 'unknown asset',
  [FeeError.InvalidFee]: 'Percent fee must be between 0 and 1'
}
