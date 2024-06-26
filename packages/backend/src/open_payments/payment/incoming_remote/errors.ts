import { GraphQLErrorCode } from '../../../graphql/errors'

export enum RemoteIncomingPaymentError {
  UnknownWalletAddress = 'UnknownWalletAddress',
  InvalidRequest = 'InvalidRequest',
  InvalidGrant = 'InvalidGrant'
}

export const isRemoteIncomingPaymentError = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  o: any
): o is RemoteIncomingPaymentError =>
  Object.values(RemoteIncomingPaymentError).includes(o)

export const errorToHTTPCode: {
  [key in RemoteIncomingPaymentError]: number
} = {
  [RemoteIncomingPaymentError.UnknownWalletAddress]: 404,
  [RemoteIncomingPaymentError.InvalidRequest]: 500,
  [RemoteIncomingPaymentError.InvalidGrant]: 500
}

export const errorToCode: {
  [key in RemoteIncomingPaymentError]: GraphQLErrorCode
} = {
  [RemoteIncomingPaymentError.UnknownWalletAddress]: GraphQLErrorCode.NotFound,
  [RemoteIncomingPaymentError.InvalidRequest]: GraphQLErrorCode.BadUserInput,
  [RemoteIncomingPaymentError.InvalidGrant]: GraphQLErrorCode.Forbidden
}
export const errorToMessage: {
  [key in RemoteIncomingPaymentError]: string
} = {
  [RemoteIncomingPaymentError.UnknownWalletAddress]: 'unknown wallet address',
  [RemoteIncomingPaymentError.InvalidRequest]:
    'invalid remote incoming payment request',
  [RemoteIncomingPaymentError.InvalidGrant]:
    'invalid grant for remote incoming payment'
}
