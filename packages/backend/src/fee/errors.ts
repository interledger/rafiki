export enum FeeError {
  UnknownAsset = 'UnknownAsset',
  InvalidFee = 'InvalidFee'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isFeeError = (o: any): o is FeeError =>
  Object.values(FeeError).includes(o)
