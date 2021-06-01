import { Errors } from 'ilp-packet'
import { createContext } from '../../utils'
import { RafikiContext, ZeroCopyIlpPrepare } from '../..'
import {
  IlpPrepareFactory,
  PeerAccountFactory,
  RafikiServicesFactory
} from '../../factories'
import { createIncomingMaxPacketAmountMiddleware } from '../../middleware/max-packet-amount'

const { AmountTooLargeError } = Errors

describe('Max Packet Amount Middleware', function () {
  const services = RafikiServicesFactory.build()
  const alice = PeerAccountFactory.build({
    accountId: 'alice',
    maxPacketAmount: BigInt(50)
  })
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
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        maxPacketAmount: alice.maxPacketAmount!.toString(),
        request: ctx.request
      }
    )
  })
})
