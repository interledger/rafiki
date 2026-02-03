import { StreamController } from '.'
import {
  ConnectionCloseFrame,
  FrameType,
  StreamCloseFrame,
  StreamDataFrame
} from 'ilp-protocol-stream/dist/src/packet'
import { PaymentSender } from '../senders/payment'
import { PaymentError } from '..'
import { IlpError } from 'ilp-packet'
import { StreamReply, StreamRequest } from '../request'

/** Controller to end a payment on ILP errors */
export class FailureController implements StreamController {
  // Application data from receiver's finalDecline(data) call, if any
  private _applicationData?: Buffer

  getApplicationData(): Buffer | undefined {
    return this._applicationData
  }

  applyRequest({ log }: StreamRequest): (reply: StreamReply) => PaymentError | void {
    return (reply: StreamReply) => {
      const closeFrame = reply.frames?.find(
        (frame): frame is ConnectionCloseFrame | StreamCloseFrame =>
          frame.type === FrameType.ConnectionClose ||
          (frame.type === FrameType.StreamClose &&
            frame.streamId.equals(PaymentSender.DEFAULT_STREAM_ID))
      )

      if (closeFrame) {
        if (reply.isReject() && reply.ilpReject.code === IlpError.F99_APPLICATION_ERROR) {
          const dataFrame = reply.frames?.find(
            (frame): frame is StreamDataFrame =>
              frame.type === FrameType.StreamData &&
              frame.streamId.equals(PaymentSender.DEFAULT_STREAM_ID)
          )
          if (dataFrame) {
            this._applicationData = dataFrame.data
          }
          return PaymentError.ApplicationError
        }
        return PaymentError.ClosedByReceiver
      }

      // Ignore fulfills without close frame
      if (!reply.isReject()) {
        return
      }

      const { code } = reply.ilpReject

      // Ignore retriable errors and F99 without close frame
      if (
        code[0] === 'T' ||
        code === IlpError.F99_APPLICATION_ERROR ||
        code === IlpError.F04_INSUFFICIENT_DESTINATION_AMOUNT ||
        code === IlpError.F05_WRONG_CONDITION ||
        code === IlpError.F08_AMOUNT_TOO_LARGE ||
        code === IlpError.R01_INSUFFICIENT_SOURCE_AMOUNT
      ) {
        return
      }

      // On any other error, end the payment immediately
      log.error('ending payment: %s error', code)
      return PaymentError.ConnectorError
    }
  }
}