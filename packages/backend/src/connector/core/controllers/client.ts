import Axios, { AxiosInstance } from 'axios'
import { Errors } from 'ilp-packet'
import { ILPContext, ILPMiddleware } from '../rafiki'
import { modifySerializedIlpPrepare } from '../lib'
//import { AxiosClient } from '../services/client/axios'
import { OutgoingState } from '../middleware/account'
import {
  OutgoingHttp,
  sendToPeer as sendToPeerDefault
} from '../services/client'

export interface ClientControllerOptions {
  sendToPeer?: (
    client: AxiosInstance,
    outgoing: OutgoingHttp,
    prepare: Buffer
  ) => Promise<Buffer>
}

export function createClientController({
  sendToPeer
}: ClientControllerOptions = {}): ILPMiddleware {
  const send = sendToPeer || sendToPeerDefault
  // TODO keepalive
  const axios = Axios.create({ timeout: 30_000 })

  return async function ilpClient(
    { request, response, state: { outgoing } }: ILPContext<OutgoingState>,
    _: () => Promise<void>
  ): Promise<void> {
    if (!outgoing) {
      throw new Errors.UnreachableError('no outgoing endpoint')
    }

    const incomingPrepare = request.rawPrepare
    const amount = request.prepare.amountChanged
      ? request.prepare.intAmount
      : undefined
    const expiresAt = request.prepare.expiresAtChanged
      ? request.prepare.expiresAt
      : undefined
    const outgoingPrepare = modifySerializedIlpPrepare(
      incomingPrepare,
      amount,
      expiresAt
    )

    response.rawReply = await send(axios, outgoing, outgoingPrepare)
  }
}
