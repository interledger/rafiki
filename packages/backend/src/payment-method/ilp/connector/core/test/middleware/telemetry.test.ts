import { ValueType } from '@opentelemetry/api'
import assert from 'assert'
import { OutgoingAccount, ZeroCopyIlpPrepare } from '../..'
import { mockCounter } from '../../../../../../tests/meter'
import { IncomingAccountFactory, RafikiServicesFactory } from '../../factories'
import { createTelemetryMiddleware } from '../../middleware/telemetry'
import { createILPContext } from '../../utils'
import { privacy } from '../../../../../../telemetry/privacy'
import { ConvertError } from '../../../../../../rates/service'

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
  accounts: {
    incoming: incomingAccount,
    outgoing: { asset: { code: 'USD', scale: 2 } } as OutgoingAccount
  },
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
  it('should call next without gathering telemetry when telemetry is not enabled (service is undefined)', async () => {
    const getOrCreateSpy = jest
      .spyOn(ctx.services.telemetry!, 'getOrCreate')
      .mockImplementation(() => mockCounter)

    const originalTelemetry = ctx.services.telemetry
    ctx.services.telemetry = undefined

    await middleware(ctx, next)

    expect(next).toHaveBeenCalled()
    expect(getOrCreateSpy).not.toHaveBeenCalled()

    // Restore the original value of services.telemetry
    ctx.services.telemetry = originalTelemetry
  })

  it('should convert to telemetry asset,apply privacy, collect telemetry and call next', async () => {
    const getOrCreateSpy = jest
      .spyOn(ctx.services.telemetry!, 'getOrCreate')
      .mockImplementation(() => mockCounter)

    const convertSpy = jest
      .spyOn(ctx.services.telemetry!.getRatesService(), 'convert')
      .mockImplementation(() => Promise.resolve(10000n))

    const applyPrivacySpy = jest
      .spyOn(privacy, 'applyPrivacy')
      .mockImplementation(() => 9992)

    await middleware(ctx, next)

    expect(convertSpy).toHaveBeenCalledWith({
      sourceAmount: BigInt(ctx.request.prepare.amount),
      sourceAsset: {
        code: ctx.accounts.outgoing.asset.code,
        scale: ctx.accounts.outgoing.asset.scale
      },
      destinationAsset: {
        code: services.telemetry!.getBaseAssetCode(),
        scale: 4
      }
    })

    expect(getOrCreateSpy).toHaveBeenCalledWith('transactions_amount', {
      description: expect.any(String),
      valueType: ValueType.DOUBLE
    })

    expect(applyPrivacySpy).toHaveBeenCalledWith(10000)

    expect(
      ctx.services.telemetry!.getOrCreate('transactions_amount').add
    ).toHaveBeenCalledWith(
      9992,
      expect.objectContaining({
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

  it('should call next without gathering telemetry when convert returns ConvertError.InvalidDestinationPrice', async () => {
    const convertSpy = jest
      .spyOn(ctx.services.telemetry!.getRatesService(), 'convert')
      .mockImplementation(() =>
        Promise.resolve(ConvertError.InvalidDestinationPrice)
      )

    const getOrCreateSpy = jest
      .spyOn(ctx.services.telemetry!, 'getOrCreate')
      .mockImplementation(() => mockCounter)

    await middleware(ctx, next)

    expect(convertSpy).toHaveBeenCalled()
    expect(getOrCreateSpy).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalled()
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
