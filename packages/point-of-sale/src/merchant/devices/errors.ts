export enum DeviceError {
  UnknownMerchant = 'UnknownMerchant',
  UnknownDevice = 'UnknownDevice',
  DeviceNotFound = 'DeviceNotFound'
}

export const deviceErrorStatusMap: Record<DeviceError, number> = {
  [DeviceError.UnknownMerchant]: 404,
  [DeviceError.UnknownDevice]: 404,
  [DeviceError.DeviceNotFound]: 404
}

export const deviceErrorMessageMap: Record<DeviceError, string> = {
  [DeviceError.UnknownMerchant]: 'Unknown merchant',
  [DeviceError.UnknownDevice]: 'Unknown POS device',
  [DeviceError.DeviceNotFound]: 'Device not found'
}

export class DeviceServiceError extends Error {
  constructor(public readonly code: DeviceError) {
    super(deviceErrorMessageMap[code])
    this.name = 'DeviceServiceError'
  }
}

//Router Specific Error
export class POSDeviceError extends Error {
  public status: number
  public details?: Record<string, unknown>

  constructor(
    serviceErrorOrStatus: DeviceServiceError | number,
    message?: string,
    details?: Record<string, unknown>
  ) {
    if (serviceErrorOrStatus instanceof DeviceServiceError) {
      super(serviceErrorOrStatus.message)
      this.status = deviceErrorStatusMap[serviceErrorOrStatus.code]
      this.details = details
    } else {
      super(message || 'Device error')
      this.status = serviceErrorOrStatus
      this.details = details
    }
    this.name = 'POSDeviceError'
  }
}
