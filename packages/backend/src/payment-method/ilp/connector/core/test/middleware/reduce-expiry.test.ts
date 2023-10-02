/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { Errors } from 'ilp-packet'
import { ZeroCopyIlpPrepare } from '../..'
import {
  IlpPrepareFactory,
  IncomingPeerFactory,
  OutgoingPeerFactory,
  RafikiServicesFactory
} from '../../factories'
import { createILPContext } from '../../utils'
import { createOutgoingReduceExpiryMiddleware } from '../../middleware/reduce-expiry'

const { InsufficientTimeoutError } = Errors
Date.now = jest.fn(() => 1434412800000) // June 16, 2015 00:00:00 GMT

describe('Outgoing Reduce Expiry Middleware', function () {
  const now = Date.now()
  const services = RafikiServicesFactory.build()
  const alice = IncomingPeerFactory.build({ id: 'alice' })
  const bob = OutgoingPeerFactory.build({ id: 'bob' })
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
  const minExpirationWindow = 3000
  const maxHoldWindow = 31000
  const middleware = createOutgoingReduceExpiryMiddleware({
    minExpirationWindow,
    maxHoldWindow
  })
  test('reduces the expiry time by the minOutgoingExpirationWindow', async () => {
    const originalExpiry = now + 6000
    const prepare = IlpPrepareFactory.build({
      expiresAt: new Date(originalExpiry)
    })
    const next = jest.fn()
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(ctx.request.prepare.expiresAt).toEqual(
      new Date(originalExpiry - minExpirationWindow)
    )
  })

  test('caps expiry to max hold time', async () => {
    const originalExpiry = now + 60000
    const prepare = IlpPrepareFactory.build({
      expiresAt: new Date(originalExpiry)
    })
    const next = jest.fn()
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)
    const destinationExpiry = originalExpiry - minExpirationWindow
    expect(destinationExpiry - now).toBeGreaterThan(maxHoldWindow)

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(ctx.request.prepare.expiresAt.getTime()).toEqual(
      new Date(now + maxHoldWindow).getTime()
    )
  })

  test('throws error if packet has already expired', async () => {
    const prepare = IlpPrepareFactory.build({
      expiresAt: new Date(now - 1000)
    })
    const next = jest.fn()
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)

    await expect(middleware(ctx, next)).rejects.toBeInstanceOf(
      InsufficientTimeoutError
    )
  })

  test('throws error if maxHoldWindow is less than the minOutgoingExpirationWindow', async () => {
    const minExpirationWindow = 6000
    const maxHoldWindow = 5000
    const middleware = createOutgoingReduceExpiryMiddleware({
      minExpirationWindow,
      maxHoldWindow
    })
    const originalExpiry = now + 60000
    const prepare = IlpPrepareFactory.build({
      expiresAt: new Date(originalExpiry)
    })
    const next = jest.fn()
    const fred = OutgoingPeerFactory.build({
      id: 'fred'
    })
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)
    ctx.accounts = {
      get incoming() {
        return alice
      },
      get outgoing() {
        return fred
      }
    }
    const destinationExpiry = originalExpiry - minExpirationWindow
    expect(destinationExpiry - now).toBeGreaterThan(maxHoldWindow) // ensures expiry is capped to maxHoldWindow

    await expect(middleware(ctx, next)).rejects.toBeInstanceOf(
      InsufficientTimeoutError
    )
  })
})
