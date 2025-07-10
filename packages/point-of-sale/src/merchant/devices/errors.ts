export enum PosDeviceError {
  UnknownMerchant = 'UnknownMerchant',
  UnknownPosDevice = 'UnknownPosDevice'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isPosDeviceError = (o: any): o is PosDeviceError =>
  Object.values(PosDeviceError).includes(o)
