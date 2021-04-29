/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { Errors } from 'ilp-packet'
import { RafikiContext, ZeroCopyIlpPrepare } from '../..'
import { IlpPrepareFactory } from '../../factories'
import { PeerFactory, RafikiServicesFactory } from '../../factories/test'
import { createContext } from '../../../utils'
import { createOutgoingReduceExpiryMiddleware } from '../../middleware/reduce-expiry'

const { InsufficientTimeoutError } = Errors
Date.now = jest.fn(() => 1434412800000) // June 16, 2015 00:00:00 GMT

describe('Outgoing Reduce Expiry Middleware', function () {
  const now = Date.now()
  const services = RafikiServicesFactory.build()
  const alice = PeerFactory.build({ id: 'alice' })
  const bob = PeerFactory.build({
    id: 'bob',
    minExpirationWindow: 3000,
    maxHoldWindow: 31000
  })
  const ctx = createContext<unknown, RafikiContext>()
  ctx.services = services
  ctx.peers = {
    get incoming() {
      return Promise.resolve(alice)
    },
    get outgoing() {
      return Promise.resolve(bob)
    }
  }
  const middleware = createOutgoingReduceExpiryMiddleware()
  test('reduces the expiry time by the minOutgoingExpirationWindow', async () => {
    const originalExpiry = now + 6000
    const prepare = IlpPrepareFactory.build({
      expiresAt: new Date(originalExpiry)
    })
    const next = jest.fn()
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(ctx.request.prepare.expiresAt).toEqual(
      new Date(originalExpiry - bob.minExpirationWindow!)
    )
  })

  test('caps expiry to max hold time', async () => {
    const originalExpiry = now + 60000
    const prepare = IlpPrepareFactory.build({
      expiresAt: new Date(originalExpiry)
    })
    const next = jest.fn()
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)
    const destinationExpiry = originalExpiry - bob.minExpirationWindow!
    expect(destinationExpiry - now).toBeGreaterThan(bob.maxHoldWindow!)

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(ctx.request.prepare.expiresAt.getTime()).toEqual(
      new Date(now + bob.maxHoldWindow!).getTime()
    )
  })

  test('throws error if packet has already expired', async () => {
    const prepare = IlpPrepareFactory.build({ expiresAt: new Date(now - 1000) })
    const next = jest.fn()
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)

    await expect(middleware(ctx, next)).rejects.toBeInstanceOf(
      InsufficientTimeoutError
    )
  })

  test('throws error if maxHoldWindow is less than the minOutgoingExpirationWindow', async () => {
    const originalExpiry = now + 60000
    const prepare = IlpPrepareFactory.build({
      expiresAt: new Date(originalExpiry)
    })
    const next = jest.fn()
    const fred = PeerFactory.build({
      id: 'fred',
      minExpirationWindow: 6000,
      maxHoldWindow: 5000
    })
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)
    ctx.peers = {
      get incoming() {
        return Promise.resolve(alice)
      },
      get outgoing() {
        return Promise.resolve(fred)
      }
    }
    const destinationExpiry = originalExpiry - fred.minExpirationWindow!
    expect(destinationExpiry - now).toBeGreaterThan(fred.maxHoldWindow!) // ensures expiry is capped to maxHoldWindow

    await expect(middleware(ctx, next)).rejects.toBeInstanceOf(
      InsufficientTimeoutError
    )
  })
})
