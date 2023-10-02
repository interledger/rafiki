import { ILPContext, ILPMiddleware } from '..'
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
): ILPMiddleware {
  const _buckets = new Map<string, TokenBucket>()

  return async (
    {
      services: { logger },
      request: { prepare },
      accounts: { outgoing }
    }: ILPContext,
    next: () => Promise<void>
  ): Promise<void> => {
    let outgoingBucket = _buckets.get(outgoing.id)
    if (!outgoingBucket) {
      outgoingBucket = createThroughputLimitBucket(options)
      if (outgoingBucket) _buckets.set(outgoing.id, outgoingBucket)
    }
    if (outgoingBucket) {
      if (!outgoingBucket.take(BigInt(prepare.amount))) {
        logger.warn(
          { prepare },
          'throttling outgoing packet due to bandwidth exceeding limit'
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
): ILPMiddleware {
  const _buckets = new Map<string, TokenBucket>()

  return async (
    {
      services: { logger },
      request: { prepare },
      accounts: { incoming }
    }: ILPContext,
    next: () => Promise<void>
  ): Promise<void> => {
    let incomingBucket = _buckets.get(incoming.id)
    if (!incomingBucket) {
      incomingBucket = createThroughputLimitBucket(options)
      if (incomingBucket) _buckets.set(incoming.id, incomingBucket)
    }
    if (incomingBucket) {
      if (!incomingBucket.take(BigInt(prepare.amount))) {
        logger.warn(
          { prepare },
          'throttling incoming packet due to bandwidth exceeding limit'
        )
        throw new InsufficientLiquidityError(
          'exceeded money bandwidth, throttling.'
        )
      }
    }
    await next()
  }
}
