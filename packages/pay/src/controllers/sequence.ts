import { RequestState, StreamController } from '.'
import { PaymentError } from '..'
import { RequestBuilder } from '../request'
import { isNonNegativeInteger, NonNegativeInteger } from '../utils'

export class Counter {
  private constructor(private count: NonNegativeInteger) {}

  static from(count: number): Counter | undefined {
    if (isNonNegativeInteger(count)) {
      return new Counter(count)
    }
  }

  increment(): void {
    this.count++
  }

  getCount(): NonNegativeInteger {
    return this.count
  }
}

/** Track the sequence number of outgoing packets */
export class SequenceController implements StreamController {
  private static PACKET_LIMIT = (2 ** 31) as NonNegativeInteger

  constructor(private readonly counter: Counter) {}

  buildRequest(request: RequestBuilder): RequestState {
    // Destroy the connection after 2^31 packets are sent for encryption safety:
    // https://github.com/interledger/rfcs/blob/master/0029-stream/0029-stream.md#513-maximum-number-of-packets-per-connection
    if (this.counter.getCount() >= SequenceController.PACKET_LIMIT) {
      request.log.error('ending payment: cannot exceed max safe sequence number.')
      return RequestState.Error(PaymentError.MaxSafeEncryptionLimit)
    } else {
      request.setSequence(this.counter.getCount())
      return RequestState.Ready()
    }
  }

  applyRequest(): undefined {
    this.counter.increment()
    return // Required by TS for `undefined` return type
  }
}
