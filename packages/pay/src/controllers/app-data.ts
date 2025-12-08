import { PaymentError } from '..'
import { RequestState, StreamController } from '.'
import { RequestBuilder, StreamReply, StreamRequest } from '../request'
import { StreamDataFrame } from 'ilp-protocol-stream/dist/src/packet'

// Injects application data on the first STREAM packet and stops the payment if that packet is rejected.
export class AppDataController implements StreamController {
  private readonly appData?: Buffer
  private readonly streamId: number
  private hasInjected = false
  private failFast = false

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
    this.failFast = true

    return RequestState.Ready()
  }

  applyRequest({ log }: StreamRequest): (reply: StreamReply) => PaymentError | void {
    const shouldFailFast = this.failFast
    this.failFast = false

    if (!shouldFailFast) {
      return () => undefined
    }

    return (reply: StreamReply) => {
      if (reply.isReject()) {
        log.error('ending payment: packet carrying application data was rejected')
        return PaymentError.AppDataRejected
      }
    }
  }
}

