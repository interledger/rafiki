import { createILPContext } from '../../utils'
import {
  AuthState,
  ILPContext,
  IncomingAccount,
  ZeroCopyIlpPrepare
} from '../..'
import { IlpPrepareFactory, RafikiServicesFactory } from '../../factories'
import {
  StreamState,
  createStreamAddressMiddleware,
  getIlpAddressForTenant
} from '../../middleware/stream-address'
import { StreamServer } from '@interledger/stream-receiver'
import {
  TenantSetting,
  TenantSettingKeys
} from '../../../../../../tenants/settings/model'

describe('Stream Address Middleware', function () {
  const services = RafikiServicesFactory.build()

  function makeIlpContext(): ILPContext<AuthState & StreamState> {
    return createILPContext({ services })
  }

  const middleware = createStreamAddressMiddleware()

  describe('createStreamAddressMiddleware', function () {
    test('skips non-stream packets', async () => {
      const prepare = IlpPrepareFactory.build()
      const ctx = makeIlpContext()
      ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)
      const next = jest.fn()

      await expect(middleware(ctx, next)).resolves.toBeUndefined()

      expect(next).toHaveBeenCalledTimes(1)
      expect(ctx.state.streamDestination).toBeUndefined()
      expect(ctx.state.streamServer).toBeUndefined()
    })

    test('sets "state.streamDestination" of stream packets', async () => {
      const ctx = makeIlpContext()
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
      } as IncomingAccount
      const next = jest.fn()

      await expect(middleware(ctx, next)).resolves.toBeUndefined()

      expect(next).toHaveBeenCalledTimes(1)
      expect(ctx.state.streamDestination).toBe('bob')
      expect(ctx.state.streamServer).toBeDefined()
    })
  })

  describe('getIlpAddressForTenant', function () {
    test('returns undefined if no state.incomingAccount set', async () => {
      const ctx = makeIlpContext()

      await expect(getIlpAddressForTenant(ctx)).resolves.toBeUndefined()
    })
    test('returns operator tenant ILP address if equals incomingAccount tenantId', async () => {
      const ctx = makeIlpContext()
      ctx.state.incomingAccount = {
        tenantId: ctx.services.config.operatorTenantId
      } as IncomingAccount

      await expect(getIlpAddressForTenant(ctx)).resolves.toBe(
        ctx.services.config.ilpAddress
      )
    })

    test('returns non-operator tenant ILP address', async () => {
      const tenantId = crypto.randomUUID()
      const tenantIlpAddress = 'test.rafiki'
      const ctx = makeIlpContext()

      ctx.state.incomingAccount = {
        tenantId: tenantId
      } as IncomingAccount

      jest
        .spyOn(ctx.services.tenantSettingService, 'get')
        .mockResolvedValueOnce([
          {
            tenantId,
            key: TenantSettingKeys.ILP_ADDRESS.name,
            value: tenantIlpAddress
          }
        ] as TenantSetting[])

      await expect(getIlpAddressForTenant(ctx)).resolves.toBe(tenantIlpAddress)
    })

    test('returns undefined if missing ILP address tenant setting', async () => {
      const tenantId = crypto.randomUUID()
      const ctx = makeIlpContext()

      ctx.state.incomingAccount = {
        tenantId: tenantId
      } as IncomingAccount

      jest
        .spyOn(ctx.services.tenantSettingService, 'get')
        .mockResolvedValueOnce([])

      await expect(getIlpAddressForTenant(ctx)).resolves.toBeUndefined()
    })
  })
})
