export enum RemoteIncomingPaymentError {
  UnknownPaymentPointer = 'UnknownPaymentPointer',
  InvalidRequest = 'InvalidRequest',
  InvalidGrant = 'InvalidGrant',
  ExpiredGrant = 'ExpiredGrant'
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
  [RemoteIncomingPaymentError.InvalidRequest]: 500,
  [RemoteIncomingPaymentError.InvalidGrant]: 500,
  [RemoteIncomingPaymentError.ExpiredGrant]: 500
}

export const errorToMessage: {
  [key in RemoteIncomingPaymentError]: string
} = {
  [RemoteIncomingPaymentError.UnknownPaymentPointer]: 'unknown payment pointer',
  [RemoteIncomingPaymentError.InvalidRequest]:
    'invalid remote incoming payment request',
  [RemoteIncomingPaymentError.InvalidGrant]:
    'invalid grant for remote incoming payment',
  [RemoteIncomingPaymentError.ExpiredGrant]:
    'expired grant for remote incoming payment'
}
