import { isIlpReply } from 'ilp-packet'
import { ILPContext, ILPMiddleware } from '../rafiki'

const CONNECTION_EXPIRY = 60 * 10 // seconds

// Track the total amount received per stream connection.
export const streamReceivedKey = (connectionId: string): string =>
  `stream_received:${connectionId}`

export function createStreamController(): ILPMiddleware {
  return async function (
    ctx: ILPContext,
    next: () => Promise<void>
  ): Promise<void> {
    const { logger, redis, streamServer } = ctx.services
    const { request, response } = ctx

    if (
      ctx.accounts.outgoing.http ||
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
    // Thanks to Redis's `stringNumbers:true`, `incrby` returns a string rather than a number.
    // This ensures that precision isn't lost when dealing with integers larger than MAX_SAFE_INTEGER.
    const query = await redis //[[err, totalReceived], [err2]]
      .multi()
      .incrby(
        connectionKey,
        request.prepare.amount.toString() as unknown as number
      )
      .expire(connectionKey, CONNECTION_EXPIRY)
      .exec()
    if (query) {
      if (typeof query[0][1] === 'string' && !query[0][0] && !query[1][0]) {
        moneyOrReply.setTotalReceived(query[0][1])
        ctx.revertTotalReceived = () =>
          redis.decrby(
            connectionKey,
            request.prepare.amount.toString() as unknown as number
          )
      } else {
        logger.warn(
          {
            totalReceived: query[0][1],
            err: query[0][0],
            err2: query[1][0]
          },
          'error incrementing stream totalReceived'
        )
      }
      response.reply = moneyOrReply.accept()
    }
  }
}
