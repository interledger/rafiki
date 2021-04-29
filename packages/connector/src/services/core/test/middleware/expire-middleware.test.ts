import { createContext } from '../../../utils'
import { createOutgoingExpireMiddleware } from '../../middleware/expire'
import { RafikiContext } from '../../rafiki'
import { IlpPrepareFactory } from '../../factories'
import { RafikiServicesFactory } from '../../factories/test'
import { ZeroCopyIlpPrepare } from '../../middleware/ilp-packet'
import { Errors } from 'ilp-packet'
const { TransferTimedOutError } = Errors

describe('Expire Middleware', function () {
  jest.useFakeTimers()

  it('throws error if out of expiry window', async () => {
    const prepare = IlpPrepareFactory.build({
      expiresAt: new Date(Date.now() + 10 * 1000)
    })
    const ctx = createContext<unknown, RafikiContext>()
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
