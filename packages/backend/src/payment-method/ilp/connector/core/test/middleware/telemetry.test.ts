import { ValueType } from '@opentelemetry/api'
import assert from 'assert'
import { OutgoingAccount, ZeroCopyIlpPrepare } from '../..'
import { IncomingAccountFactory, RafikiServicesFactory } from '../../factories'
import { createTelemetryMiddleware } from '../../middleware/telemetry'
import { createILPContext } from '../../utils'
import { mockCounter } from '../mocks/telemetry'

const incomingAccount = IncomingAccountFactory.build({ id: 'alice' })

assert.ok(incomingAccount.id)
const services = RafikiServicesFactory.build({})

const ctx = createILPContext({
  services,
  request: {
    prepare: {
      amount: 100n
    } as unknown as ZeroCopyIlpPrepare,
    rawPrepare: Buffer.from('')
  },
  accounts: { incoming: incomingAccount, outgoing: {} as OutgoingAccount },
  state: {
    unfulfillable: false
  }
})

const middleware = createTelemetryMiddleware()
const next = jest.fn().mockImplementation(() => Promise.resolve())

beforeEach(async () => {
  incomingAccount.balance = 100n
  incomingAccount.asset.scale = 2
  incomingAccount.asset.code = 'USD'
  ctx.state.unfulfillable = false
})

describe('Telemetry Middleware', function () {
  it('should gather telemetry and call next', async () => {
    const getOrCreateSpy = jest
      .spyOn(ctx.services.telemetry!, 'getOrCreate')
      .mockImplementation(() => mockCounter)

    await middleware(ctx, next)

    expect(getOrCreateSpy).toHaveBeenCalledWith('transactions_amount', {
      description: expect.any(String),
      valueType: ValueType.DOUBLE
    })

    expect(
      ctx.services.telemetry!.getOrCreate('transactions_amount').add
    ).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({
        asset_code: 'USD',
        source: 'serviceName'
      })
    )

    expect(next).toHaveBeenCalled()
  })

  it('should call next without gathering telemetry when state is unfulfillable', async () => {
    ctx.state.unfulfillable = true

    const getOrCreateSpy = jest
      .spyOn(ctx.services.telemetry!, 'getOrCreate')
      .mockImplementation(() => mockCounter)

    await middleware(ctx, next)

    expect(getOrCreateSpy).not.toHaveBeenCalled()
  })
})
