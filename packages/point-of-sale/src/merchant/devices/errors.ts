export enum PosDeviceError {
  UnknownMerchant = 'UnknownMerchant',
  UnknownPosDevice = 'UnknownPosDevice'
}

export const errorToHTTPCode: {
  [key in PosDeviceError]: number
} = {
  [PosDeviceError.UnknownMerchant]: 400,
  [PosDeviceError.UnknownPosDevice]: 404
}

export const errorToMessage: {
  [key in PosDeviceError]: string
} = {
  [PosDeviceError.UnknownMerchant]: 'unknown merchant',
  [PosDeviceError.UnknownPosDevice]: 'unknown POS device'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isPosDeviceError = (o: any): o is PosDeviceError =>
  Object.values(PosDeviceError).includes(o)

export class PosDeviceRouteError extends Error {
  public status: number
  public details?: Record<string, unknown>

  constructor(error: PosDeviceError, details?: Record<string, unknown>) {
    super(errorToMessage[error])
    this.status = errorToHTTPCode[error]
    this.name = 'PosDeviceRouteError'
    this.details = details
  }
}
