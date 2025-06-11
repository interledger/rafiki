import { createILPContext } from '../../utils'
import { ZeroCopyIlpPrepare } from '../..'
import { IlpPrepareFactory, RafikiServicesFactory } from '../../factories'
import { createStreamAddressMiddleware } from '../../middleware/stream-address'
import { StreamServer } from '@interledger/stream-receiver'

describe('Stream Address Middleware', function () {
  const services = RafikiServicesFactory.build()
  const ctx = createILPContext({ services })
  const middleware = createStreamAddressMiddleware()

  test('skips non-stream packets', async () => {
    const prepare = IlpPrepareFactory.build()
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)
    const next = jest.fn()

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(next).toHaveBeenCalledTimes(1)
    expect(ctx.state.streamDestination).toBeUndefined()
  })

  test('sets "state.streamDestination" of stream packets', async () => {
    const streamServer = new StreamServer({
      serverAddress: ctx.services.config.ilpAddress,
      serverSecret: ctx.services.config.streamSecret
    })

    const prepare = IlpPrepareFactory.build({
      destination: streamServer.generateCredentials({
        paymentTag: 'bob'
      }).ilpAddress
    })

    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)
    ctx.state.incomingAccount = {
      tenantId: ctx.services.config.operatorTenantId
    }
    const next = jest.fn()

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(next).toHaveBeenCalledTimes(1)
    expect(ctx.state['streamDestination']).toBe('bob')
  })
})
