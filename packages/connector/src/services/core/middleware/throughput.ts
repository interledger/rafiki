import { RafikiContext, Peer, RafikiMiddleware } from '..'
import { Errors } from 'ilp-packet'
import { TokenBucket } from '../../utils'
const { InsufficientLiquidityError } = Errors

const DEFAULT_REFILL_PERIOD = 1000 // 1 second

export function createThroughputLimitBucketsForPeer(
  peer: Peer,
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
    { services: { logger }, request: { prepare }, peers }: RafikiContext,
    next: () => Promise<unknown>
  ): Promise<void> => {
    const peer = await peers.outgoing
    let outgoingBucket = _buckets.get(peer.id)
    if (!outgoingBucket) {
      outgoingBucket = createThroughputLimitBucketsForPeer(peer, 'outgoing')
      if (outgoingBucket) _buckets.set(peer.id, outgoingBucket)
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
    { services: { logger }, request: { prepare }, peers }: RafikiContext,
    next: () => Promise<unknown>
  ): Promise<void> => {
    const peer = await peers.incoming
    let incomingBucket = _buckets.get(peer.id)
    if (!incomingBucket) {
      incomingBucket = createThroughputLimitBucketsForPeer(peer, 'incoming')
      if (incomingBucket) _buckets.set(peer.id, incomingBucket)
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
