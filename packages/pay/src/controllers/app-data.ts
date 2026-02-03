import { RequestState, StreamController } from '.'
import { RequestBuilder } from '../request'
import { StreamDataFrame } from 'ilp-protocol-stream/dist/src/packet'

// Injects application data on the first STREAM packet
export class AppController implements StreamController {
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
}
