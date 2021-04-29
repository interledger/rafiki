import { RafikiContext } from '../rafiki'
import { modifySerializedIlpPrepare } from '../lib'

export function createClientController() {
  return async function ilpClient({
    peers: { outgoing },
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
    const peer = await outgoing
    response.rawReply = await peer.send(outgoingPrepare)
  }
}
