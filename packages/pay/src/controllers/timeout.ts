import { RequestState, StreamController } from '.'
import { PaymentError } from '..'
import { StreamReply, StreamRequest } from '../request'

export class TimeoutController implements StreamController {
  /** Number of milliseconds since the last Fulfill was received before the payment should fail */
  private static MAX_DURATION_SINCE_LAST_FULFILL = 10_000

  /** UNIX millisecond timestamp after which the payment should fail is no fulfill was received */
  private deadline?: number

  buildRequest(request: StreamRequest): RequestState {
    if (this.deadline && Date.now() > this.deadline) {
      request.log.error(
        'ending payment: no fulfill received before idle deadline.'
      )
      return RequestState.Error(PaymentError.IdleTimeout)
    } else {
      return RequestState.Ready()
    }
  }

  applyRequest(): (reply: StreamReply) => void {
    if (!this.deadline) {
      this.resetDeadline()
    }

    return (reply: StreamReply): void => {
      if (reply.isFulfill()) {
        this.resetDeadline()
      }
    }
  }

  private resetDeadline(): void {
    this.deadline =
      Date.now() + TimeoutController.MAX_DURATION_SINCE_LAST_FULFILL
  }
}
