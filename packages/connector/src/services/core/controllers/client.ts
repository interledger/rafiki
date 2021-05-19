import Axios, { AxiosInstance, AxiosRequestConfig } from 'axios'
import { RafikiContext } from '../rafiki'
import { modifySerializedIlpPrepare } from '../lib'
//import { AxiosClient } from '../services/client/axios'
import { sendToPeer } from '../services/client'

export function createClientController() {
  // TODO keepalive
  const axios = Axios.create({ timeout: 30_000 })

  return async function ilpClient({
    accounts: { outgoing },
    request,
    response
  }: RafikiContext): Promise<void> {
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

    response.rawReply = await sendToPeer(axios, outgoing, outgoingPrepare)
  }
}
