import { Errors } from 'ilp-packet'
import { RafikiContext, RafikiMiddleware } from '..'
import { TokenBucket } from '../utils'
import { IlpAccount }  from '../services'

const { RateLimitedError } = Errors

const DEFAULT_REFILL_PERIOD = 60 * 1000 // 1 minute
const DEFAULT_REFILL_COUNT = BigInt(10000)

function createRateLimitBucketForPeer(peerInfo: IlpAccount): TokenBucket {
  const {
    rateLimitRefillPeriod,
    rateLimitRefillCount,
    rateLimitCapacity
  } = peerInfo
  const refillPeriod: number = rateLimitRefillPeriod || DEFAULT_REFILL_PERIOD
  const refillCount: bigint = rateLimitRefillCount || DEFAULT_REFILL_COUNT
  const capacity: bigint =
    typeof rateLimitCapacity !== 'undefined' ? rateLimitCapacity : refillCount

  // TODO: When we add the ability to update middleware, our state will get
  //   reset every update, which may not be desired.
  return new TokenBucket({ refillPeriod, refillCount, capacity })
}

/**
 * Throttles throughput based on the number of requests per minute.
 */
export function createIncomingRateLimitMiddleware(): RafikiMiddleware {
  const buckets = new Map<string, TokenBucket>()
  return async (
    { services: { logger }, request: { prepare }, accounts: { incoming } }: RafikiContext,
    next: () => Promise<unknown>
  ): Promise<void> => {
    let bucket = buckets.get(incoming.accountId)
    if (!bucket) {
      bucket = createRateLimitBucketForPeer(incoming)
      buckets.set(incoming.accountId, bucket)
    }
    if (!bucket.take()) {
      logger.warn('rate limited a packet', { bucket, prepare, accountId: incoming.accountId })
      throw new RateLimitedError('too many requests, throttling.')
    }
    await next()
  }
}
