import { RequestState, StreamController } from '.'
import { IlpAddress } from 'ilp-packet'
import { StreamReply, RequestBuilder } from '../request'
import {
  ConnectionMaxDataFrame,
  ConnectionMaxStreamIdFrame
} from 'ilp-protocol-stream/dist/src/packet'
import { PaymentDestination } from '../open-payments'
import { PaymentSender } from '../senders/payment'

/** Direct packets to the receiver to establish the connection and share limits */
export class EstablishmentController implements StreamController {
  private readonly destinationAddress: IlpAddress
  private isConnected = false

  constructor({ destinationAddress }: PaymentDestination) {
    this.destinationAddress = destinationAddress
  }

  didConnect(): boolean {
    return this.isConnected
  }

  buildRequest(request: RequestBuilder): RequestState {
    request.setDestinationAddress(this.destinationAddress)

    if (!this.isConnected) {
      request.addFrames(
        // Disallow any new streams (and only the client can open stream 1)
        new ConnectionMaxStreamIdFrame(PaymentSender.DEFAULT_STREAM_ID),
        // Disallow incoming data
        new ConnectionMaxDataFrame(0)
      )
    }

    return RequestState.Ready()
  }

  applyRequest(): (reply: StreamReply) => void {
    return (reply: StreamReply) => {
      // Ready sending connection limits in each packet until we receive an authenticated response
      this.isConnected = this.isConnected || reply.isAuthentic()
    }
  }
}
