import { Errors } from 'ilp-packet'
import { PeerInfo, RafikiContext, RafikiMiddleware } from '..'
import { TokenBucket } from '../utils'

const { RateLimitedError } = Errors

const DEFAULT_REFILL_PERIOD = 60 * 1000 // 1 minute
const DEFAULT_REFILL_COUNT = BigInt(10000)

export function createRateLimitBucketForPeer(peerInfo: PeerInfo): TokenBucket {
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
    { services: { logger }, request: { prepare }, peers }: RafikiContext,
    next: () => Promise<unknown>
  ): Promise<void> => {
    const peer = await peers.incoming
    let bucket = buckets.get(peer.id)
    if (!bucket) {
      bucket = createRateLimitBucketForPeer(peer)
      buckets.set(peer.id, bucket)
    }
    if (!bucket.take()) {
      logger.warn('rate limited a packet', { bucket, prepare, peer })
      throw new RateLimitedError('too many requests, throttling.')
    }
    await next()
  }
}
