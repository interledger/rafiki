import { GraphQLErrorCode } from '../graphql/errors'

export enum TenantError {
  UnknownError = 'UnknownError'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const isTenantError = (t: any): t is TenantError =>
  Object.values(TenantError).includes(t)

export const errorToCode: {
  [key in TenantError]: GraphQLErrorCode
} = {
  [TenantError.UnknownError]: GraphQLErrorCode.InternalServerError
}

export const errorToMessage: {
  [key in TenantError]: string
} = {
  [TenantError.UnknownError]: 'Unknown error'
}
