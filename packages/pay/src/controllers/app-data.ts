import { PaymentError } from '..'
import { RequestState, StreamController } from '.'
import { RequestBuilder, StreamReply, StreamRequest } from '../request'
import { StreamDataFrame, FrameType } from 'ilp-protocol-stream/dist/src/packet'
import { IlpError } from 'ilp-packet'
import Long from 'long'

// Injects application data on the first STREAM packet and stops the payment if that packet is rejected.
export class AppDataController implements StreamController {
  private readonly appData?: Buffer
  private readonly streamId: number
  private hasInjected = false

  constructor(appData?: Uint8Array | string | Buffer, streamId = 1) {
    this.streamId = streamId
    if (appData) {
      this.appData = Buffer.isBuffer(appData) ? appData : Buffer.from(appData)
    }
  }

  buildRequest(request: RequestBuilder): RequestState {
    if (!this.appData || this.hasInjected) {
      return RequestState.Ready()
    }

    request.addFrames(new StreamDataFrame(this.streamId, 0, this.appData))
    this.hasInjected = true

    return RequestState.Ready()
  }

  applyRequest({
    frames,
    log
  }: StreamRequest): (reply: StreamReply) => PaymentError | void {
    const streamId = Long.fromNumber(this.streamId, true)
    const hasAppData = frames.some(
      (frame): frame is StreamDataFrame =>
        frame.type === FrameType.StreamData && frame.streamId.equals(streamId)
    )

    if (!hasAppData) {
      return () => undefined
    }

    return (reply: StreamReply) => {
      if (!reply.isReject()) {
        return
      }

      const { code } = reply.ilpReject

      // Let other controllers handle these errors
      if (
        code === IlpError.F08_AMOUNT_TOO_LARGE ||
        code === IlpError.R01_INSUFFICIENT_SOURCE_AMOUNT ||
        code[0] === 'T'
      ) {
        return
      }

      // For other errors (including F06, F99), if app data was present, return AppDataRejected
      log.error(
        'ending payment: packet carrying application data was rejected: %s',
        code
      )
      return PaymentError.AppDataRejected
    }
  }
}
