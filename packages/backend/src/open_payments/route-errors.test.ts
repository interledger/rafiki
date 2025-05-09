import { AppContext, AppServices } from '../app'
import { createContext } from '../tests/context'
import {
  OpenPaymentsServerRouteError,
  openPaymentsServerErrorMiddleware
} from './route-errors'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '..'
import { Config } from '../config/app'
import { OpenAPIValidatorMiddlewareError } from '@interledger/openapi'
import { SPSPRouteError } from '../payment-method/ilp/spsp/middleware'

describe('openPaymentServerErrorMiddleware', (): void => {
  let deps: IocContract<AppServices>
  let ctx: AppContext

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
  })

  beforeEach(async (): Promise<void> => {
    ctx = createContext(
      {
        headers: {
          accept: 'application/json'
        }
      },
      {}
    )

    ctx.container = deps
  })

  test('handles OpenPaymentsServerRouteError simple error', async (): Promise<void> => {
    const error = new OpenPaymentsServerRouteError(401, 'Some error')
    const next = jest.fn().mockImplementationOnce(() => {
      throw error
    })

    const ctxThrowSpy = jest.spyOn(ctx, 'throw')

    await expect(
      openPaymentsServerErrorMiddleware(ctx, next)
    ).resolves.toBeUndefined()

    expect(ctx.response.body).toMatchObject({
      error: {
        code: `${error.status}`,
        description: error.message
      }
    })
    expect(ctx.response.status).toBe(error.status)
    expect(ctx.response.type).toBe('application/json')
    expect(ctxThrowSpy).toHaveBeenCalledTimes(0)
    expect(next).toHaveBeenCalledTimes(1)
  })

  test('handles OpenPaymentsServerRouteError detailed error', async (): Promise<void> => {
    const error = new OpenPaymentsServerRouteError(401, 'Some detailed error', {
      optional: 'details'
    })
    const next = jest.fn().mockImplementationOnce(() => {
      throw error
    })

    const ctxThrowSpy = jest.spyOn(ctx, 'throw')

    await expect(
      openPaymentsServerErrorMiddleware(ctx, next)
    ).resolves.toBeUndefined()

    expect(ctx.response.body).toMatchObject({
      error: {
        code: `${error.status}`,
        description: error.message,
        details: {
          optional: 'details'
        }
      }
    })
    expect(ctx.response.status).toBe(error.status)
    expect(ctx.response.type).toBe('application/json')
    expect(ctxThrowSpy).toHaveBeenCalledTimes(0)
    expect(next).toHaveBeenCalledTimes(1)
  })

  test('handles OpenAPIValidatorMiddlewareError error', async (): Promise<void> => {
    const error = new OpenAPIValidatorMiddlewareError('Validation error', 400)
    const next = jest.fn().mockImplementationOnce(() => {
      throw error
    })

    const ctxThrowSpy = jest.spyOn(ctx, 'throw')

    await expect(
      openPaymentsServerErrorMiddleware(ctx, next)
    ).resolves.toBeUndefined()

    expect(ctx.response.body).toMatchObject({
      error: {
        code: `${error.status}`,
        description: error.message
      }
    })
    expect(ctx.response.status).toBe(error.status)
    expect(ctx.response.type).toBe('application/json')
    expect(ctxThrowSpy).toHaveBeenCalledTimes(0)
    expect(next).toHaveBeenCalledTimes(1)
  })

  test('handles SPSPRouteError error', async (): Promise<void> => {
    const error = new SPSPRouteError(400, 'SPSP error')
    const next = jest.fn().mockImplementationOnce(() => {
      throw error
    })

    const ctxThrowSpy = jest.spyOn(ctx, 'throw')

    await expect(
      openPaymentsServerErrorMiddleware(ctx, next)
    ).resolves.toBeUndefined()

    expect(ctx.response.body).toMatchObject({
      error: {
        code: `${error.status}`,
        description: error.message
      }
    })
    expect(ctx.response.status).toBe(error.status)
    expect(ctx.response.type).toBe('application/json')
    expect(ctxThrowSpy).toHaveBeenCalledTimes(0)
    expect(next).toHaveBeenCalledTimes(1)
  })

  test('handles unspecified error', async (): Promise<void> => {
    const error = new Error('Some unspecified error')
    const next = jest.fn().mockImplementationOnce(() => {
      throw error
    })

    const ctxThrowSpy = jest.spyOn(ctx, 'throw')

    await expect(
      openPaymentsServerErrorMiddleware(ctx, next)
    ).rejects.toMatchObject({
      status: 500,
      message: 'Internal Server Error'
    })

    expect(ctxThrowSpy).toHaveBeenCalledWith(500)
    expect(next).toHaveBeenCalledTimes(1)
  })
})
