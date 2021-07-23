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
  const alice = PeerAccountFactory.build({ accountId: 'alice' })
  const bob = PeerAccountFactory.build({ accountId: 'bob' })
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

  test('throws RateLimitedError when payments arrive too quickly', async () => {
    const middleware = createIncomingRateLimitMiddleware({ capacity: 0n })
    const bucketTakeSpy = jest.spyOn(TokenBucket.prototype, 'take')
    const prepare = IlpPrepareFactory.build()
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)
    const next = jest.fn()

    await expect(middleware(ctx, next)).rejects.toBeInstanceOf(RateLimitedError)

    expect(bucketTakeSpy).toHaveBeenCalled()
  })

  test('does not throw error if rate limit is not exceeded', async () => {
    const middleware = createIncomingRateLimitMiddleware({ capacity: 1n })
    const bucketTakeSpy = jest.spyOn(TokenBucket.prototype, 'take')
    const prepare = IlpPrepareFactory.build()
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)
    const next = jest.fn()

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(bucketTakeSpy).toHaveBeenCalled()
  })
})
