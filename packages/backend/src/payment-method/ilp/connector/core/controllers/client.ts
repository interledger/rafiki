import Axios, { AxiosInstance } from 'axios'
import { OutgoingAccount, ILPContext, ILPMiddleware } from '../rafiki'
import { modifySerializedIlpPrepare } from '../lib'
//import { AxiosClient } from '../services/client/axios'
import { sendToPeer as sendToPeerDefault } from '../services/client'

export interface ClientControllerOptions {
  sendToPeer?: (
    client: AxiosInstance,
    account: OutgoingAccount,
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
    { accounts: { outgoing }, request, response }: ILPContext,
    _: () => Promise<void>
  ): Promise<void> {
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

    response.rawReply = await send(axios, outgoing, outgoingPrepare) // This is the sender's response from the receiver, but we don't collect here in case an error is thrown which will be caught by error handling middleware
  }
}
