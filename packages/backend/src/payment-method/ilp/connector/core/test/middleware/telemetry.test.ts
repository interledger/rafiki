import { ValueType } from '@opentelemetry/api'
import assert from 'assert'
import { OutgoingAccount, ZeroCopyIlpPrepare } from '../..'
import { ConvertError } from '../../../../../../rates/service'
import { privacy } from '../../../../../../telemetry/privacy'
import { mockCounter } from '../../../../../../tests/meter'
import { IncomingAccountFactory, RafikiServicesFactory } from '../../factories'
import {
  collectTelemetryAmount,
  createTelemetryMiddleware
} from '../../middleware/telemetry'
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

    expect(getOrCreateSpy).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalled()

    ctx.services.telemetry = originalTelemetry
  })

  it('should call next without gathering telemetry when state is unfulfillable', async () => {
    ctx.state.unfulfillable = true

    const getOrCreateSpy = jest
      .spyOn(ctx.services.telemetry!, 'getOrCreate')
      .mockImplementation(() => mockCounter)

    await middleware(ctx, next)

    expect(getOrCreateSpy).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalled()
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

  describe('collectTelemetry', () => {
    it('should convert to telemetry asset,apply privacy, collect telemetry', async () => {
      const ratesService = ctx.services.telemetry!.getRatesService()
      const convertSpy = jest
        .spyOn(ratesService, 'convert')
        .mockResolvedValue(10000n)

      const addSpy = jest.spyOn(
        ctx.services.telemetry!.getOrCreate('transactions_amount', {
          description: 'Amount sent through the network',
          valueType: ValueType.DOUBLE
        }),
        'add'
      )

      const applyPrivacySpy = jest
        .spyOn(privacy, 'applyPrivacy')
        .mockReturnValue(10000)

      await collectTelemetryAmount(ctx.services.telemetry!, {
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

      expect(applyPrivacySpy).toHaveBeenCalledWith(10000)
      expect(addSpy).toHaveBeenCalledWith(10000, {
        source: ctx.services.telemetry!.getServiceName()
      })
    })
  })
})
