import { isIlpReply } from 'ilp-packet'
import { RafikiContext, RafikiMiddleware } from '../rafiki'

const CONNECTION_EXPIRY = 60 * 60 // seconds

// Track the total amount received per stream connection.
export const streamReceivedKey = (connectionId: string): string =>
  `stream_received:${connectionId}`

export function createStreamController(): RafikiMiddleware {
  return async function (
    ctx: RafikiContext,
    next: () => Promise<unknown>
  ): Promise<void> {
    const { redis, streamServer } = ctx.services
    const { request, response } = ctx

    const { stream } = ctx.accounts.outgoing
    if (
      !stream ||
      !stream.enabled ||
      !streamServer.decodePaymentTag(request.prepare.destination) // XXX mark this earlier in the middleware pipeline
    ) {
      await next()
      return
    }

    const moneyOrReply = streamServer.createReply(request.prepare)
    if (isIlpReply(moneyOrReply)) {
      response.reply = moneyOrReply
      return
    }

    const { connectionId } = moneyOrReply
    const totalReceived = await redis.incrby(
      streamReceivedKey(connectionId),
      +request.prepare.amount
    )
    moneyOrReply.setTotalReceived(totalReceived)
    if (totalReceived !== +request.prepare.amount) {
      // Set key expiry once, when the first packet arrives.
      await redis.expire(connectionId, CONNECTION_EXPIRY)
    }
    response.reply = moneyOrReply.accept()
  }
}
