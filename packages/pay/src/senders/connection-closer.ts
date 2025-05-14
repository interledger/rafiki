import { SendState, StreamController } from '../controllers'
import { ConnectionCloseFrame, ErrorCode } from 'ilp-protocol-stream/dist/src/packet'
import { EstablishmentController } from '../controllers/establishment'
import { SequenceController } from '../controllers/sequence'
import { ExpiryController } from '../controllers/expiry'
import { Plugin, RequestBuilder } from '../request'
import { StreamSender } from '.'
import { ResolvedPayment } from '..'

/** Send a best-effort `ConnectionClose` frame if necessary, and resolve if it was sent */
export class ConnectionCloser extends StreamSender<void> {
  private sentCloseFrame = false

  protected readonly controllers: StreamController[]

  constructor(plugin: Plugin, destination: ResolvedPayment) {
    super(plugin, destination)

    this.controllers = [
      new SequenceController(destination.requestCounter),
      new EstablishmentController(destination),
      new ExpiryController(),
    ]
  }

  nextState(request: RequestBuilder): SendState<void> {
    if (this.sentCloseFrame) {
      return SendState.Yield() // Don't schedule another attempt
    }
    this.sentCloseFrame = true
    request.log.debug('trying to send connection close frame.')

    request.addFrames(new ConnectionCloseFrame(ErrorCode.NoError, ''))

    return SendState.Send(() =>
      // After request completes, finish send loop
      SendState.Done(undefined)
    )
  }
}
