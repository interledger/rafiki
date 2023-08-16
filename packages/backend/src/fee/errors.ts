export enum FeeError {
  UnknownAsset = 'UnknownAsset',
  InvalidBasisPointFee = 'InvalidBasisPointFee',
  InvalidFixedFee = 'InvalidFixedFee'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isFeeError = (o: any): o is FeeError =>
  Object.values(FeeError).includes(o)

export const errorToCode: {
  [key in FeeError]: number
} = {
  [FeeError.UnknownAsset]: 404,
  [FeeError.InvalidBasisPointFee]: 400,
  [FeeError.InvalidFixedFee]: 400
}

export const errorToMessage: {
  [key in FeeError]: string
} = {
  [FeeError.UnknownAsset]: 'unknown asset',
  [FeeError.InvalidBasisPointFee]:
    'Basis point fee must be between 0 and 10000',
  [FeeError.InvalidFixedFee]: 'Fixed fee must be greater than or equal to 0'
}
