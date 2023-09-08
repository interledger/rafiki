export enum AutoPeeringError {
  UnsupportedAsset = 'UnsupportedAsset',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isAutoPeeringError = (o: any): o is AutoPeeringError =>
  Object.values(AutoPeeringError).includes(o)

export const errorToCode: {
  [key in AutoPeeringError]: number
} = {
  [AutoPeeringError.UnsupportedAsset]: 400
}

export const errorToMessage: {
  [key in AutoPeeringError]: string
} = {
  [AutoPeeringError.UnsupportedAsset]: 'Unsupported asset'
}
