import { Errors } from 'ilp-packet'
import { createContext } from '../../utils'
import { RafikiContext, ZeroCopyIlpPrepare } from '../../core'
import {
  RafikiServicesFactory,
  PeerFactory,
  IlpPrepareFactory
} from '../../core/factories'
import { createIncomingMaxPacketAmountMiddleware } from '../max-packet-amount'

const { AmountTooLargeError } = Errors

describe('Max Packet Amount Middleware', function () {
  const services = RafikiServicesFactory.build()
  const alice = PeerFactory.build({ id: 'alice', maxPacketAmount: BigInt(50) })
  const bob = PeerFactory.build({ id: 'bob' })
  const ctx = createContext<any, RafikiContext>()
  ctx.services = services
  ctx.peers = {
    get incoming () {
      return Promise.resolve(alice)
    },
    get outgoing () {
      return Promise.resolve(bob)
    }
  }
  const middleware = createIncomingMaxPacketAmountMiddleware()

  test('forwards packet below max packet amount', async () => {
    const prepareBelowMaxAmount = IlpPrepareFactory.build({ amount: '49' })
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepareBelowMaxAmount)
    const next = jest.fn()

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(next).toHaveBeenCalled()
  })

  test('forwards packet equal to the max packet amount', async () => {
    const prepareBelowMaxAmount = IlpPrepareFactory.build({ amount: '50' })
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepareBelowMaxAmount)
    const next = jest.fn()

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(next).toHaveBeenCalled()
  })

  test('throws AmounTooLargeError and logs warning if prepare amount exceeds maximum balance for the peer', async () => {
    const prepareOverMaxAmount = IlpPrepareFactory.build({ amount: '51' })
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepareOverMaxAmount)
    const next = jest.fn()

    await expect(middleware(ctx, next)).rejects.toBeInstanceOf(
      AmountTooLargeError
    )

    expect(next).toHaveBeenCalledTimes(0)
    expect(ctx.services.logger.warn).toHaveBeenCalledWith(
      'rejected a packet due to amount exceeding maxPacketAmount',
      {
        maxPacketAmount: alice.maxPacketAmount!.toString(),
        request: ctx.request
      }
    )
  })
})
