export enum WalletAddressError {
  InvalidUrl = 'InvalidUrl',
  UnknownAsset = 'UnknownAsset',
  UnknownWalletAddress = 'UnknownWalletAddress'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isWalletAddressError = (o: any): o is WalletAddressError =>
  Object.values(WalletAddressError).includes(o)

export const errorToCode: {
  [key in WalletAddressError]: number
} = {
  [WalletAddressError.InvalidUrl]: 400,
  [WalletAddressError.UnknownAsset]: 400,
  [WalletAddressError.UnknownWalletAddress]: 404
}

export const errorToMessage: {
  [key in WalletAddressError]: string
} = {
  [WalletAddressError.InvalidUrl]: 'invalid url',
  [WalletAddressError.UnknownAsset]: 'unknown asset',
  [WalletAddressError.UnknownWalletAddress]: 'unknown wallet address'
}
