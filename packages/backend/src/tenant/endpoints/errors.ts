import { GraphQLErrorCode } from '../../graphql/errors'

export enum TenantEndpointError {
  UnknownError = 'UnknownError'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const isTenantEndpointError = (t: any): t is TenantEndpointError =>
  Object.values(TenantEndpointError).includes(t)

export const errorToCode: {
  [key in TenantEndpointError]: GraphQLErrorCode
} = {
  [TenantEndpointError.UnknownError]: GraphQLErrorCode.InternalServerError
}

export const errorToMessage: {
  [key in TenantEndpointError]: string
} = {
  [TenantEndpointError.UnknownError]: 'Unknown error'
}
