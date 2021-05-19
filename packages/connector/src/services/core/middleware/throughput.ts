import { RafikiContext, RafikiMiddleware } from '..'
import { Errors } from 'ilp-packet'
import { TokenBucket } from '../utils'
import { IlpAccount } from '../services'
const { InsufficientLiquidityError } = Errors

const DEFAULT_REFILL_PERIOD = 1000 // 1 second

export function createThroughputLimitBucketsForPeer(
  peer: IlpAccount,
  inOrOut: 'incoming' | 'outgoing'
): TokenBucket | undefined {
  const incomingAmount = peer.incomingThroughputLimit || false
  const outgoingAmount = peer.outgoingThroughputLimit || false

  if (inOrOut === 'incoming' && incomingAmount) {
    // TODO: We should handle updates to the peer config
    const refillPeriod = peer.incomingThroughputLimitRefillPeriod
      ? peer.incomingThroughputLimitRefillPeriod
      : DEFAULT_REFILL_PERIOD
    return new TokenBucket({
      refillPeriod,
      refillCount: BigInt(incomingAmount)
    })
  }
  if (inOrOut === 'outgoing' && outgoingAmount) {
    // TODO: We should handle updates to the peer config
    const refillPeriod = peer.outgoingThroughputLimitRefillPeriod
      ? peer.outgoingThroughputLimitRefillPeriod
      : DEFAULT_REFILL_PERIOD
    return new TokenBucket({
      refillPeriod,
      refillCount: BigInt(outgoingAmount)
    })
  }
}

export function createOutgoingThroughputMiddleware(): RafikiMiddleware {
  const _buckets = new Map<string, TokenBucket>()

  return async (
    { services: { logger }, request: { prepare }, accounts: { outgoing } }: RafikiContext,
    next: () => Promise<unknown>
  ): Promise<void> => {
    let outgoingBucket = _buckets.get(outgoing.accountId)
    if (!outgoingBucket) {
      outgoingBucket = createThroughputLimitBucketsForPeer(outgoing, 'outgoing')
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
export function createIncomingThroughputMiddleware(): RafikiMiddleware {
  const _buckets = new Map<string, TokenBucket>()

  return async (
    { services: { logger }, request: { prepare }, accounts: { incoming } }: RafikiContext,
    next: () => Promise<unknown>
  ): Promise<void> => {
    let incomingBucket = _buckets.get(incoming.accountId)
    if (!incomingBucket) {
      incomingBucket = createThroughputLimitBucketsForPeer(incoming, 'incoming')
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
