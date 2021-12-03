import { Errors } from 'ilp-packet'
import { ILPContext, ILPMiddleware } from '..'
import { accountToId, TokenBucket } from '../utils'

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
): ILPMiddleware {
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
    }: ILPContext,
    next: () => Promise<void>
  ): Promise<void> => {
    const accountId = accountToId(incoming)
    let bucket = buckets.get(accountId)
    if (!bucket) {
      // TODO: When we add the ability to update middleware, our state will get
      //   reset every update, which may not be desired.
      bucket = new TokenBucket({ refillPeriod, refillCount, capacity })
      buckets.set(accountId, bucket)
    }
    if (!bucket.take()) {
      logger.warn(
        {
          bucket,
          prepare,
          accountId
        },
        'rate limited a packet'
      )
      throw new RateLimitedError('too many requests, throttling.')
    }
    await next()
  }
}
