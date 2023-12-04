import { ValueType } from '@opentelemetry/api'
import assert from 'assert'
import { OutgoingAccount, ZeroCopyIlpPrepare } from '../..'
import { mockCounter } from '../../../../../../tests/meter'
import { IncomingAccountFactory, RafikiServicesFactory } from '../../factories'
import { createTelemetryMiddleware } from '../../middleware/telemetry'
import { createILPContext } from '../../utils'

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
    unfulfillable: false,
    incomingAccount: {
      quote: 'exists'
    }
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
  it('should gather telemetry in correct asset scale and call next', async () => {
    const getOrCreateSpy = jest
      .spyOn(ctx.services.telemetry!, 'getOrCreate')
      .mockImplementation(() => mockCounter)

    const expectedScaledValue =
      Number(ctx.request.prepare.amount) *
      Math.pow(10, 4 - incomingAccount.asset.scale)

    await middleware(ctx, next)

    expect(getOrCreateSpy).toHaveBeenCalledWith('transactions_amount', {
      description: expect.any(String),
      valueType: ValueType.DOUBLE
    })

    expect(
      ctx.services.telemetry!.getOrCreate('transactions_amount').add
    ).toHaveBeenCalledWith(
      expectedScaledValue,
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

  it('should only gather amount data on the sending side of a transaction. It should call next when there is no quote on the incomingAccount.', async () => {
    ctx.state.incomingAccount.quote = ''

    const getOrCreateSpy = jest
      .spyOn(ctx.services.telemetry!, 'getOrCreate')
      .mockImplementation(() => mockCounter)

    await middleware(ctx, next)

    expect(getOrCreateSpy).not.toHaveBeenCalled()
  })

  it('should handle invalid amount by calling next without gathering telemetry', async () => {
    ctx.request.prepare.amount = '0'

    const getOrCreateSpy = jest
      .spyOn(ctx.services.telemetry!, 'getOrCreate')
      .mockImplementation(() => mockCounter)

    await middleware(ctx, next)

    expect(getOrCreateSpy).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalled()
  })
})
