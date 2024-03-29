import assert from 'assert'
import { IlpResponse, OutgoingAccount, ZeroCopyIlpPrepare } from '../..'
import { IncomingAccountFactory, RafikiServicesFactory } from '../../factories'
import { createTelemetryMiddleware } from '../../middleware/telemetry'
import { createILPContext } from '../../utils'

import * as telemetry from '../../../../../../telemetry/transaction-amount'
import { IlpFulfill } from 'ilp-packet'

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
  },
  response: {
    fulfill: 'exists' as unknown as IlpFulfill
  } as IlpResponse
})

jest.mock('../../../../../../telemetry/transaction-amount')

const middleware = createTelemetryMiddleware()
const next = jest.fn().mockImplementation(() => Promise.resolve())

beforeEach(async () => {
  incomingAccount.balance = 100n
  incomingAccount.asset.scale = 2
  incomingAccount.asset.code = 'USD'
})

describe('Telemetry Middleware', function () {
  it('does not gather telemetry if telemetry is not enabled (service is undefined)', async () => {
    const collectAmountSpy = jest
      .spyOn(telemetry, 'collectTelemetryAmount')
      .mockImplementation(() => Promise.resolve())

    await middleware(
      { ...ctx, services: { ...ctx.services, telemetry: undefined } },
      next
    )
    expect(collectAmountSpy).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalled()
  })

  it('does not gather telemetry if response.fulfill undefined', async () => {
    const collectAmountSpy = jest.spyOn(telemetry, 'collectTelemetryAmount')

    await middleware(
      { ...ctx, response: { fulfill: undefined } as IlpResponse },
      next
    )

    expect(collectAmountSpy).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalled()
  })

  it('does not gather telemetry if amount is invalid', async () => {
    const collectAmountSpy = jest.spyOn(telemetry, 'collectTelemetryAmount')

    await middleware(
      {
        ...ctx,
        request: {
          ...ctx.request,
          prepare: { amount: '0' } as ZeroCopyIlpPrepare
        }
      },
      next
    )

    expect(collectAmountSpy).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalled()
  })

  it('gathers telemetry after next was called', async () => {
    let nextCalled = false
    const next = jest.fn().mockImplementation(() => {
      nextCalled = true
      return Promise.resolve()
    })

    const collectAmountSpy = jest
      .spyOn(telemetry, 'collectTelemetryAmount')
      .mockImplementation(() => {
        expect(nextCalled).toBe(true)
        return Promise.resolve()
      })

    await middleware(ctx, next)

    expect(collectAmountSpy).toHaveBeenCalled()
    expect(next).toHaveBeenCalled()
  })
})
