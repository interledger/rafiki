import { Errors } from 'ilp-packet'
import { createContext, TokenBucket } from '../../utils'
import { RafikiContext, ZeroCopyIlpPrepare } from '../../core'
import {
  RafikiServicesFactory,
  PeerFactory,
  IlpPrepareFactory
} from '../../core/factories'
import { createIncomingRateLimitMiddleware } from '../rate-limit'
const { RateLimitedError } = Errors

describe('Rate Limit Middleware', function () {
  const services = RafikiServicesFactory.build()
  const alice = PeerFactory.build({ id: 'alice', rateLimitCapacity: BigInt(1) }) // bucket that has initial capacity of 1 and refills 10 000 every minute
  const bob = PeerFactory.build({ id: 'bob', rateLimitCapacity: BigInt(0) }) // bucket that has initial capacity of 0 and refills 10 000 every minute
  const ctx = createContext<any, RafikiContext>()
  ctx.services = services
  const middleware = createIncomingRateLimitMiddleware()

  test('throws RateLimitedError when payments arrive too quickly', async () => {
    const bucketTakeSpy = jest.spyOn(TokenBucket.prototype, 'take')
    ctx.peers = {
      get incoming () {
        return Promise.resolve(bob)
      },
      get outgoing () {
        return Promise.resolve(alice)
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
    ctx.peers = {
      get incoming () {
        return Promise.resolve(alice)
      },
      get outgoing () {
        return Promise.resolve(bob)
      }
    }
    const prepare = IlpPrepareFactory.build()
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)
    const next = jest.fn()

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(bucketTakeSpy).toHaveBeenCalled()
  })
})
