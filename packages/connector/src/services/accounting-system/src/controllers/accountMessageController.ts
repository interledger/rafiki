import {
  PeerNotFoundError,
  STATIC_CONDITION,
  sendToPeer
} from '@interledger/rafiki-core'
import { serializeIlpPrepare, deserializeIlpReply, isReject } from 'ilp-packet'
import { AccountingSystemContext } from '../index'

export async function create (ctx: AccountingSystemContext): Promise<void> {
  const peerId = ctx.request.params.peerId
  try {
    // TODO: Do we need to do some validation here that the SE is supposed to be talking to this peer?

    const message = Buffer.from(ctx.request.body)
    const packet = serializeIlpPrepare({
      amount: '0',
      destination: 'peer.settle',
      executionCondition: STATIC_CONDITION,
      expiresAt: new Date(Date.now() + 60000),
      data: message
    })

    const reply = deserializeIlpReply(
      await sendToPeer(peerId, packet, ctx.services.peers)
    )
    if (isReject(reply)) {
      throw new Error('IlpPacket to settlement engine was rejected')
    }

    ctx.response.status = 200
    ctx.body = reply.data
  } catch (error) {
    if (error instanceof PeerNotFoundError) {
      ctx.response.status = 404
      ctx.response.message = error.message
      return
    }
    throw error
  }
}
