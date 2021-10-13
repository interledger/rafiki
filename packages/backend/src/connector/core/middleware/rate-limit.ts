import { Errors } from 'ilp-packet'
import { RafikiContext, RafikiMiddleware } from '..'
import { TokenBucket } from '../utils'

const { RateLimitedError } = Errors

const DEFAULT_REFILL_PERIOD = 60 * 1000 // 1 minute
const DEFAULT_REFILL_COUNT = BigInt(10000)

export interface RateLimitMiddlewareOptions {
  refillPeriod?: number
  refillCount?: bigint
  capacity?: bigint
}

/**
 * Throttles throughput based on the number of requests per minute.
 */
export function createIncomingRateLimitMiddleware(
  options: RateLimitMiddlewareOptions
): RafikiMiddleware {
  const buckets = new Map<string, TokenBucket>()
  const refillPeriod: number = options.refillPeriod || DEFAULT_REFILL_PERIOD
  const refillCount: bigint = options.refillCount || DEFAULT_REFILL_COUNT
  const capacity: bigint =
    typeof options.capacity !== 'undefined' ? options.capacity : refillCount

  return async (
    {
      services: { logger },
      request: { prepare },
      accounts: { incoming }
    }: RafikiContext,
    next: () => Promise<unknown>
  ): Promise<void> => {
    let bucket = buckets.get(incoming.id)
    if (!bucket) {
      // TODO: When we add the ability to update middleware, our state will get
      //   reset every update, which may not be desired.
      bucket = new TokenBucket({ refillPeriod, refillCount, capacity })
      buckets.set(incoming.id, bucket)
    }
    if (!bucket.take()) {
      logger.warn(
        {
          bucket,
          prepare,
          accountId: incoming.id
        },
        'rate limited a packet'
      )
      throw new RateLimitedError('too many requests, throttling.')
    }
    await next()
  }
}
