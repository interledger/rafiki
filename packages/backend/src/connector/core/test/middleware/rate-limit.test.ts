import { Errors } from 'ilp-packet'
import { createILPContext, TokenBucket } from '../../utils'
import { ZeroCopyIlpPrepare } from '../..'
import {
  IlpPrepareFactory,
  PeerAccountFactory,
  RafikiServicesFactory
} from '../../factories'
import { createIncomingRateLimitMiddleware } from '../../middleware/rate-limit'
const { RateLimitedError } = Errors

describe('Rate Limit Middleware', function () {
  const services = RafikiServicesFactory.build()
  const alice = PeerAccountFactory.build({ id: 'alice' })
  const bob = PeerAccountFactory.build({ id: 'bob' })
  const ctx = createILPContext({
    services,
    accounts: {
      get incoming() {
        return alice
      },
      get outgoing() {
        return bob
      }
    }
  })

  test('throws RateLimitedError when payments arrive too quickly', async () => {
    const middleware = createIncomingRateLimitMiddleware({ capacity: 0n })
    const bucketTakeSpy = jest.spyOn(TokenBucket.prototype, 'take')
    const prepare = IlpPrepareFactory.build()
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)
    const next = jest.fn()

    await expect(middleware(ctx, next)).rejects.toBeInstanceOf(RateLimitedError)

    expect(bucketTakeSpy).toHaveBeenCalled()
    expect(next).toHaveBeenCalledTimes(0)
  })

  test('does not throw error if rate limit is not exceeded', async () => {
    const middleware = createIncomingRateLimitMiddleware({ capacity: 1n })
    const bucketTakeSpy = jest.spyOn(TokenBucket.prototype, 'take')
    const prepare = IlpPrepareFactory.build()
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)
    const next = jest.fn()

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(bucketTakeSpy).toHaveBeenCalled()
    expect(next).toHaveBeenCalledTimes(1)
  })
})
