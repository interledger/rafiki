import { RequestState, StreamController } from '.'
import { RequestBuilder } from '../request'

export class ExpiryController implements StreamController {
  /**
   * Maximum duration that a ILP Prepare can be in-flight before it should be rejected, in milliseconds.
   * This is longer than the payment timeout duration to account for the min message
   * window each connector may subtract from the expiry.
   */
  private static DEFAULT_PACKET_EXPIRY_MS = 20_000

  buildRequest(request: RequestBuilder): RequestState {
    request.setExpiry(
      new Date(Date.now() + ExpiryController.DEFAULT_PACKET_EXPIRY_MS)
    )
    return RequestState.Ready()
  }
}
