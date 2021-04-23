import { createContext } from '@interledger/rafiki-utils'
import { createOutgoingExpireMiddleware } from '../../src/middleware/expire'
import { RafikiContext } from '../../src/rafiki'
import { IlpPrepareFactory, RafikiServicesFactory } from '../../src/factories'
import { ZeroCopyIlpPrepare } from '../../src/middleware/ilp-packet'
import { TransferTimedOutError } from 'ilp-packet/dist/src/errors'

describe('Expire Middleware', function () {
  jest.useFakeTimers()

  it('throws error if out of expiry window', async () => {
    const prepare = IlpPrepareFactory.build({
      expiresAt: new Date(Date.now() + 10 * 1000)
    })
    const ctx = createContext<any, RafikiContext>()
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)
    ctx.services = RafikiServicesFactory.build()
    const next = jest.fn().mockImplementation(() => {
      jest.advanceTimersByTime(11 * 1000)
    })
    const middleware = createOutgoingExpireMiddleware()

    await expect(middleware(ctx, next)).rejects.toBeInstanceOf(
      TransferTimedOutError
    )
  })
})
