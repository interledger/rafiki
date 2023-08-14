export enum FeeError {
  UnknownAsset = 'UnknownAsset',
  InvalidPercentageFee = 'InvalidPercentageFee',
  InvalidFixedFee = 'InvalidFixedFee',
  MissingFee = 'MissingFee'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isFeeError = (o: any): o is FeeError =>
  Object.values(FeeError).includes(o)

export const errorToCode: {
  [key in FeeError]: number
} = {
  [FeeError.UnknownAsset]: 404,
  [FeeError.InvalidPercentageFee]: 400,
  [FeeError.InvalidFixedFee]: 400,
  [FeeError.MissingFee]: 400
}

export const errorToMessage: {
  [key in FeeError]: string
} = {
  [FeeError.UnknownAsset]: 'unknown asset',
  [FeeError.InvalidPercentageFee]: 'Percent fee must be between 0 and 1',
  [FeeError.InvalidFixedFee]: 'Fixed fee must be greater than or equal to 0',
  [FeeError.MissingFee]: 'Either fixed or percentage fee must be greater than 0'
}
