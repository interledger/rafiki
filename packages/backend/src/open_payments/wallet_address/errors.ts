import { GraphQLErrorCode } from '../../graphql/errors'

export enum WalletAddressError {
  InvalidUrl = 'InvalidUrl',
  UnknownAsset = 'UnknownAsset',
  UnknownWalletAddress = 'UnknownWalletAddress',
  DuplicateWalletAddress = 'DuplicateWalletAddress',
  WalletAddressSettingNotFound = 'WalletAddressSettingNotFound'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isWalletAddressError = (o: any): o is WalletAddressError =>
  Object.values(WalletAddressError).includes(o)

export const errorToCode: {
  [key in WalletAddressError]: GraphQLErrorCode
} = {
  [WalletAddressError.InvalidUrl]: GraphQLErrorCode.BadUserInput,
  [WalletAddressError.UnknownAsset]: GraphQLErrorCode.BadUserInput,
  [WalletAddressError.UnknownWalletAddress]: GraphQLErrorCode.NotFound,
  [WalletAddressError.DuplicateWalletAddress]: GraphQLErrorCode.Duplicate,
  [WalletAddressError.WalletAddressSettingNotFound]: GraphQLErrorCode.NotFound
}

export const errorToMessage: {
  [key in WalletAddressError]: string
} = {
  [WalletAddressError.InvalidUrl]: 'invalid url',
  [WalletAddressError.UnknownAsset]: 'unknown asset',
  [WalletAddressError.UnknownWalletAddress]: 'unknown wallet address',
  [WalletAddressError.DuplicateWalletAddress]:
    'Duplicate wallet address found with the same url',
  [WalletAddressError.WalletAddressSettingNotFound]:
    'Setting for wallet address has not been found.'
}
