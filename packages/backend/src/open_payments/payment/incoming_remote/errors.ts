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

export const errorToCode: {
  [key in RemoteIncomingPaymentError]: number
} = {
  [RemoteIncomingPaymentError.UnknownWalletAddress]: 404,
  [RemoteIncomingPaymentError.InvalidRequest]: 500,
  [RemoteIncomingPaymentError.InvalidGrant]: 500
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
