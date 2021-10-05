import { Errors } from 'ilp-packet'
import { RafikiContext, ZeroCopyIlpPrepare } from '../..'
import {
  IlpPrepareFactory,
  PeerAccountFactory,
  RafikiServicesFactory
} from '../../factories'
import { createContext, TokenBucket } from '../../utils'
import {
  createIncomingThroughputMiddleware,
  createOutgoingThroughputMiddleware
} from '../../middleware/throughput'

const { InsufficientLiquidityError } = Errors

describe('Incoming Throughput Middleware', function () {
  const services = RafikiServicesFactory.build()
  const alice = PeerAccountFactory.build({
    id: 'alice'
  })
  const bob = PeerAccountFactory.build({ id: 'bob' })
  const ctx = createContext<unknown, RafikiContext>()
  ctx.services = services
  ctx.accounts = {
    get incoming() {
      return alice
    },
    get outgoing() {
      return bob
    }
  }

  test('throws error if throughput limit exceeded', async () => {
    const middleware = createIncomingThroughputMiddleware({
      throughputLimit: BigInt(10),
      throughputLimitRefillPeriod: 10000
    })
    Date.now = jest.fn(() => 1434412800000) // June 16, 2015 00:00:00 GMT
    const prepare = IlpPrepareFactory.build({ amount: '100' })
    const next = jest.fn()
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)

    await expect(middleware(ctx, next)).rejects.toBeInstanceOf(
      InsufficientLiquidityError
    )
    expect(services.logger.warn).toHaveBeenCalled()
  })

  test('allows throughput again after refill period', async () => {
    const middleware = createIncomingThroughputMiddleware({
      throughputLimit: BigInt(10),
      throughputLimitRefillPeriod: 10000
    })
    const now = 1434412800000
    // first return value for token bucket constructor, subsequent for prepare packets being sent
    Date.now = jest
      .fn()
      .mockReturnValueOnce(now)
      .mockReturnValueOnce(now)
      .mockReturnValueOnce(now + 1000)
      .mockReturnValueOnce(now + 12000) // move time along every time now is called
    const prepare = IlpPrepareFactory.build({ amount: '10' })
    const next = jest.fn()
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)

    // will use up entire throughput limit
    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    // time is 1 second after now
    await expect(middleware(ctx, next)).rejects.toBeInstanceOf(
      InsufficientLiquidityError
    )
    expect(services.logger.warn).toHaveBeenCalled()

    // time is 12 seconds after now
    await expect(middleware(ctx, next)).resolves.toBeUndefined()
  })

  test('no rate limit bucket is checked if throughput limit is not set', async () => {
    const middleware = createOutgoingThroughputMiddleware()
    const prepare = IlpPrepareFactory.build({ amount: '10' })
    const next = jest.fn()
    const takeSpy = jest.spyOn(TokenBucket.prototype, 'take')
    ctx.accounts = {
      get incoming() {
        return bob
      },
      get outgoing() {
        return alice
      }
    }
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)

    // will use up entire throughput limit
    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(takeSpy).toHaveBeenCalledTimes(0)
  })
})

describe('Outgoing Throughput Middleware', function () {
  const services = RafikiServicesFactory.build()
  const alice = PeerAccountFactory.build({ id: 'alice' })
  const bob = PeerAccountFactory.build({
    id: 'bob'
  })
  const ctx = createContext<unknown, RafikiContext>()
  ctx.services = services
  ctx.accounts = {
    get incoming() {
      return alice
    },
    get outgoing() {
      return bob
    }
  }

  test('throws error if throughput limit exceeded', async () => {
    const middleware = createOutgoingThroughputMiddleware({
      throughputLimit: BigInt(10),
      throughputLimitRefillPeriod: 10000
    })
    Date.now = jest.fn(() => 1434412800000) // June 16, 2015 00:00:00 GMT
    const prepare = IlpPrepareFactory.build({ amount: '100' })
    const next = jest.fn()
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)

    await expect(middleware(ctx, next)).rejects.toBeInstanceOf(
      InsufficientLiquidityError
    )
    expect(services.logger.warn).toHaveBeenCalled()
  })

  test('allows throughput again after refill period', async () => {
    const middleware = createOutgoingThroughputMiddleware({
      throughputLimit: BigInt(10),
      throughputLimitRefillPeriod: 10000
    })
    const now = 1434412800000
    // first return value for token bucket constructor, subsequent for prepare packets being sent
    Date.now = jest
      .fn()
      .mockReturnValueOnce(now)
      .mockReturnValueOnce(now)
      .mockReturnValueOnce(now + 1000)
      .mockReturnValueOnce(now + 12000) // move time along every time now is called
    const prepare = IlpPrepareFactory.build({ amount: '10' })
    const next = jest.fn()
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)

    // will use up entire throughput limit
    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    // time is 1 second after now
    await expect(middleware(ctx, next)).rejects.toBeInstanceOf(
      InsufficientLiquidityError
    )
    expect(services.logger.warn).toHaveBeenCalled()

    // time is 12 seconds after now
    await expect(middleware(ctx, next)).resolves.toBeUndefined()
  })

  test('no rate limit bucket is checked if throughput limit is not set', async () => {
    const middleware = createOutgoingThroughputMiddleware()
    const prepare = IlpPrepareFactory.build({ amount: '10' })
    const next = jest.fn()
    const takeSpy = jest.spyOn(TokenBucket.prototype, 'take')
    ctx.accounts = {
      get incoming() {
        return bob
      },
      get outgoing() {
        return alice
      }
    }
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)

    // will use up entire throughput limit
    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(takeSpy).toHaveBeenCalledTimes(0)
  })
})
