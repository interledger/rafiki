export enum RemoteIncomingPaymentError {
  UnknownPaymentPointer = 'UnknownPaymentPointer',
  UnknownAuthServer = 'UnknownAuthServer',
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
  [RemoteIncomingPaymentError.UnknownPaymentPointer]: 404,
  [RemoteIncomingPaymentError.UnknownAuthServer]: 404,
  [RemoteIncomingPaymentError.InvalidRequest]: 500,
  [RemoteIncomingPaymentError.InvalidGrant]: 500
}

export const errorToMessage: {
  [key in RemoteIncomingPaymentError]: string
} = {
  [RemoteIncomingPaymentError.UnknownPaymentPointer]: 'unknown payment pointer',
  [RemoteIncomingPaymentError.UnknownAuthServer]: 'unknown auth server',
  [RemoteIncomingPaymentError.InvalidRequest]:
    'invalid remote incoming payment request',
  [RemoteIncomingPaymentError.InvalidGrant]:
    'invalid grant for remote incoming payment'
}
