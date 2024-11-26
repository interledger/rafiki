import { GraphQLErrorCode } from '../../graphql/errors'

export enum TenantSettingError {
  UnknownError = 'UnknownError'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const isTenantSettingError = (t: any): t is TenantSettingError =>
  Object.values(TenantSettingError).includes(t)

export const errorToCode: {
  [key in TenantSettingError]: GraphQLErrorCode
} = {
  [TenantSettingError.UnknownError]: GraphQLErrorCode.InternalServerError
}

export const errorToMessage: {
  [key in TenantSettingError]: string
} = {
  [TenantSettingError.UnknownError]: 'Unknown error'
}
