import { GraphQLErrorCode } from '../graphql/errors'

export enum TenantError {
  UnknownError = 'UnknownError',
  UnknownTenant = 'UnknownTenant'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const isTenantError = (t: any): t is TenantError =>
  Object.values(TenantError).includes(t)

export const errorToCode: {
  [key in TenantError]: GraphQLErrorCode
} = {
  [TenantError.UnknownError]: GraphQLErrorCode.InternalServerError,
  [TenantError.UnknownTenant]: GraphQLErrorCode.NotFound
}

export const errorToMessage: {
  [key in TenantError]: string
} = {
  [TenantError.UnknownError]: 'Unknown error',
  [TenantError.UnknownTenant]: 'Unknown Tenant'
}
