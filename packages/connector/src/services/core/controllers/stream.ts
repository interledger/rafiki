import { isIlpReply } from 'ilp-packet'
import { RafikiContext, RafikiMiddleware } from '../rafiki'

const CONNECTION_EXPIRY = 60 * 10 // seconds

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
    const connectionKey = streamReceivedKey(connectionId)
    // Pass the amount as a string so that values higher than MAX_SAFE_INTEGER aren't modified by a local float conversion.
    // Ignore the running total returned by `incrby`, since it is parsed to a `Number`, which may
    // be inaccurate if the value is higher than MAX_SAFE_INTEGER.
    await redis.incrby(
      connectionKey,
      (request.prepare.amount as unknown) as number
    )
    await redis.expire(connectionKey, CONNECTION_EXPIRY)
    const totalReceived = await redis.get(connectionKey)
    moneyOrReply.setTotalReceived(totalReceived)
    response.reply = moneyOrReply.accept()
  }
}
