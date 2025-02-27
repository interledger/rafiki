import { StreamController } from '.'
import {
  ConnectionCloseFrame,
  FrameType,
  ErrorCode,
  StreamCloseFrame,
} from 'ilp-protocol-stream/dist/src/packet'
import { PaymentSender } from '../senders/payment'
import { PaymentError } from '..'
import { IlpError } from 'ilp-packet'
import { StreamReply, StreamRequest } from '../request'

/** Controller to end a payment on ILP errors */
export class FailureController implements StreamController {
  applyRequest({ log }: StreamRequest): (reply: StreamReply) => PaymentError | void {
    return (reply: StreamReply) => {
      const closeFrame = reply.frames?.find(
        (frame): frame is ConnectionCloseFrame | StreamCloseFrame =>
          frame.type === FrameType.ConnectionClose ||
          (frame.type === FrameType.StreamClose &&
            frame.streamId.equals(PaymentSender.DEFAULT_STREAM_ID))
      )
      if (closeFrame) {
        log.error(
          'ending payment: receiver closed the connection. reason=%s message="%s"',
          ErrorCode[closeFrame.errorCode],
          closeFrame.errorMessage
        )
        return PaymentError.ClosedByReceiver
      }

      // Ignore Fulfills, temporary errors, F08, F99, R01
      if (!reply.isReject()) {
        return
      }
      const { code } = reply.ilpReject
      if (
        code[0] === 'T' ||
        code === IlpError.F08_AMOUNT_TOO_LARGE ||
        code === IlpError.F99_APPLICATION_ERROR ||
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
