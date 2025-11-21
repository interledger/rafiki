import { GraphQLErrorCode } from '../../graphql/errors'

export enum TenantSettingError {
  TenantNotFound = 'TenantNotFound',
  UnknownError = 'UnknownError',
  InvalidSetting = 'InvalidSettingError',
  DuplicateWalletAddressUrl = 'DuplicateWalletAddressUrl'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const isTenantSettingError = (t: any): t is TenantSettingError =>
  Object.values(TenantSettingError).includes(t)

export const errorToCode: {
  [key in TenantSettingError]: GraphQLErrorCode
} = {
  [TenantSettingError.InvalidSetting]: GraphQLErrorCode.BadUserInput,
  [TenantSettingError.TenantNotFound]: GraphQLErrorCode.NotFound,
  [TenantSettingError.UnknownError]: GraphQLErrorCode.InternalServerError,
  [TenantSettingError.DuplicateWalletAddressUrl]: GraphQLErrorCode.BadUserInput
}

export const errorToMessage: {
  [key in TenantSettingError]: string
} = {
  [TenantSettingError.TenantNotFound]: 'Tenant not found',
  [TenantSettingError.UnknownError]: 'Unknown error',
  [TenantSettingError.InvalidSetting]:
    'Invalid value for one or more tenant settings',
  [TenantSettingError.DuplicateWalletAddressUrl]:
    'Wallet Address Url already exists'
}
