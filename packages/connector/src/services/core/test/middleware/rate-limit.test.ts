import { Errors } from 'ilp-packet'
import { createContext, TokenBucket } from '../../utils'
import { RafikiContext, ZeroCopyIlpPrepare } from '../..'
import {
  IlpPrepareFactory,
  PeerAccountFactory,
  RafikiServicesFactory
} from '../../factories'
import { createIncomingRateLimitMiddleware } from '../../middleware/rate-limit'
const { RateLimitedError } = Errors

describe('Rate Limit Middleware', function () {
  const services = RafikiServicesFactory.build()
  const alice = PeerAccountFactory.build({
    accountId: 'alice',
    rateLimitCapacity: BigInt(1)
  }) // bucket that has initial capacity of 1 and refills 10 000 every minute
  const bob = PeerAccountFactory.build({
    accountId: 'bob',
    rateLimitCapacity: BigInt(0)
  }) // bucket that has initial capacity of 0 and refills 10 000 every minute
  const ctx = createContext<unknown, RafikiContext>()
  ctx.services = services
  const middleware = createIncomingRateLimitMiddleware()

  test('throws RateLimitedError when payments arrive too quickly', async () => {
    const bucketTakeSpy = jest.spyOn(TokenBucket.prototype, 'take')
    ctx.accounts = {
      get incoming() {
        return bob
      },
      get outgoing() {
        return alice
      }
    }
    const prepare = IlpPrepareFactory.build()
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)
    const next = jest.fn()

    await expect(middleware(ctx, next)).rejects.toBeInstanceOf(RateLimitedError)

    expect(bucketTakeSpy).toHaveBeenCalled()
  })

  test('does not throw error if rate limit is not exceeded', async () => {
    const bucketTakeSpy = jest.spyOn(TokenBucket.prototype, 'take')
    ctx.accounts = {
      get incoming() {
        return alice
      },
      get outgoing() {
        return bob
      }
    }
    const prepare = IlpPrepareFactory.build()
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)
    const next = jest.fn()

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(bucketTakeSpy).toHaveBeenCalled()
  })
})
