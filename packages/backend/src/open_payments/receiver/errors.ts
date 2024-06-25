import { GraphQLErrorCode } from '../../graphql/errors'
import {
  errorToMessage as incomingPaymentErrorToMessage,
  errorToCode as incomingPaymentErrorToCode,
  isIncomingPaymentError,
  IncomingPaymentError
} from '../payment/incoming/errors'
import {
  errorToMessage as remoteIncomingPaymentErrorToMessage,
  errorToCode as remoteIncomingPaymentErrorToCode,
  RemoteIncomingPaymentError
} from '../payment/incoming_remote/errors'

export type ReceiverError = IncomingPaymentError | RemoteIncomingPaymentError
export const ReceiverError = {
  ...IncomingPaymentError,
  ...RemoteIncomingPaymentError
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isReceiverError = (o: any): o is ReceiverError =>
  Object.values(ReceiverError).includes(o)

export const errorToCode = (error: ReceiverError): GraphQLErrorCode =>
  isIncomingPaymentError(error)
    ? incomingPaymentErrorToCode[error]
    : remoteIncomingPaymentErrorToCode[error]

export const errorToMessage = (error: ReceiverError): string =>
  isIncomingPaymentError(error)
    ? incomingPaymentErrorToMessage[error]
    : remoteIncomingPaymentErrorToMessage[error]
