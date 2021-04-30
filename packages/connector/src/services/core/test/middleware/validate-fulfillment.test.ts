import { Errors } from 'ilp-packet'
import { RafikiContext, ZeroCopyIlpPrepare } from '../..'
import { createContext } from '../../utils'
import { createOutgoingValidateFulfillmentMiddleware } from '../../middleware/validate-fulfillment'
import {
  IlpPrepareFactory,
  IlpFulfillFactory,
  IlpRejectFactory
} from '../../factories'
import { RafikiServicesFactory } from '../../factories/test'

const { WrongConditionError } = Errors

describe('Validate Fulfillment Middleware', function () {
  const services = RafikiServicesFactory.build()
  const ctx = createContext<unknown, RafikiContext>()
  ctx.services = services
  const middleware = createOutgoingValidateFulfillmentMiddleware()

  beforeEach(() => {
    ctx.response.fulfill = undefined
    ctx.response.reject = undefined
  })

  test('throws wrong condition error if fulfillment is incorrect', async () => {
    const prepare = IlpPrepareFactory.build({
      executionCondition: Buffer.from(
        'uzoYx3K6u+Nt6kZjbN6KmH0yARfhkj9e17eQfpSeB7U=',
        'base64'
      )
    })
    const incorrectFulfill = IlpFulfillFactory.build({
      fulfillment: Buffer.from('ILPHaxsILPHaxsILPHaxsILPHILPHaxs')
    })
    const next = jest.fn().mockImplementation(() => {
      ctx.response.fulfill = incorrectFulfill
    })
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)

    await expect(middleware(ctx, next)).rejects.toBeInstanceOf(
      WrongConditionError
    )
    expect(ctx.services.logger.warn).toHaveBeenCalled()
  })

  test('forwards fulfills with correct fullfillment', async () => {
    const prepare = IlpPrepareFactory.build()
    const fulfill = IlpFulfillFactory.build()
    const next = jest.fn().mockImplementation(() => {
      ctx.response.fulfill = fulfill
    })
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(ctx.response.fulfill).toEqual(fulfill)
  })

  test('forwards reject packets', async () => {
    const prepare = IlpPrepareFactory.build()
    const reject = IlpRejectFactory.build()
    const next = jest.fn().mockImplementation(() => {
      ctx.response.reject = reject
    })
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(ctx.response.reject).toEqual(reject)
  })
})
