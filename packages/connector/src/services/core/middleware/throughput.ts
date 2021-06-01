import { RafikiContext, RafikiMiddleware } from '..'
import { Errors } from 'ilp-packet'
import { TokenBucket } from '../utils'
const { InsufficientLiquidityError } = Errors

const DEFAULT_REFILL_PERIOD = 1000 // 1 second

export interface ThroughputMiddlewareOptions {
  throughputLimitRefillPeriod?: number
  throughputLimit?: bigint
}

function createThroughputLimitBucket(
  options: ThroughputMiddlewareOptions
): TokenBucket | undefined {
  if (!options.throughputLimit) return
  const refillPeriod =
    options.throughputLimitRefillPeriod || DEFAULT_REFILL_PERIOD
  return new TokenBucket({
    refillPeriod,
    refillCount: options.throughputLimit
  })
}

export function createOutgoingThroughputMiddleware(
  options: ThroughputMiddlewareOptions = {}
): RafikiMiddleware {
  const _buckets = new Map<string, TokenBucket>()

  return async (
    {
      services: { logger },
      request: { prepare },
      accounts: { outgoing }
    }: RafikiContext,
    next: () => Promise<unknown>
  ): Promise<void> => {
    let outgoingBucket = _buckets.get(outgoing.accountId)
    if (!outgoingBucket) {
      outgoingBucket = createThroughputLimitBucket(options)
      if (outgoingBucket) _buckets.set(outgoing.accountId, outgoingBucket)
    }
    if (outgoingBucket) {
      if (!outgoingBucket.take(BigInt(prepare.amount))) {
        logger.warn(
          'throttling outgoing packet due to bandwidth exceeding limit',
          { prepare }
        )
        throw new InsufficientLiquidityError(
          'exceeded money bandwidth, throttling.'
        )
      }
    }
    await next()
  }
}

/**
 * The Throughput rule throttles throughput based on the amount in the packets.
 */
export function createIncomingThroughputMiddleware(
  options: ThroughputMiddlewareOptions = {}
): RafikiMiddleware {
  const _buckets = new Map<string, TokenBucket>()

  return async (
    {
      services: { logger },
      request: { prepare },
      accounts: { incoming }
    }: RafikiContext,
    next: () => Promise<unknown>
  ): Promise<void> => {
    let incomingBucket = _buckets.get(incoming.accountId)
    if (!incomingBucket) {
      incomingBucket = createThroughputLimitBucket(options)
      if (incomingBucket) _buckets.set(incoming.accountId, incomingBucket)
    }
    if (incomingBucket) {
      if (!incomingBucket.take(BigInt(prepare.amount))) {
        logger.warn(
          'throttling incoming packet due to bandwidth exceeding limit',
          { prepare }
        )
        throw new InsufficientLiquidityError(
          'exceeded money bandwidth, throttling.'
        )
      }
    }
    await next()
  }
}
