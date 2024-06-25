import { IocContract } from '@adonisjs/fold'

import { AppContext, AppServices } from '../app'
import { Config } from '../config/app'
import { initIocContainer } from '..'
import { createContext } from '../tests/context'
import {
  GNAPErrorCode,
  GNAPServerRouteError,
  gnapServerErrorMiddleware
} from './gnapErrors'
import { OpenAPIValidatorMiddlewareError } from '@interledger/openapi'

describe('gnapServerErrorMiddleware', (): void => {
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

  test('handles OpenAPIValidatorMiddlewareError', async (): Promise<void> => {
    const error = new OpenAPIValidatorMiddlewareError('Validation error', 400)
    const next = jest.fn().mockImplementationOnce(() => {
      throw error
    })

    await expect(gnapServerErrorMiddleware(ctx, next)).resolves.toBeUndefined()
    expect(ctx.body).toEqual({
      error: {
        description: error.message
      }
    })
    expect(ctx.status).toBe(error.status)
    expect(next).toHaveBeenCalledTimes(1)
  })

  test('handles GNAPServerRouteError error', async (): Promise<void> => {
    const error = new GNAPServerRouteError(
      401,
      GNAPErrorCode.RequestDenied,
      'test error'
    )
    const next = jest.fn().mockImplementationOnce(() => {
      throw error
    })

    await expect(gnapServerErrorMiddleware(ctx, next)).resolves.toBeUndefined()
    expect(ctx.body).toEqual({
      error: {
        code: error.code,
        description: error.message
      }
    })
    expect(ctx.status).toBe(error.status)
    expect(next).toHaveBeenCalledTimes(1)
  })

  test('handles unknown error', async (): Promise<void> => {
    const error = new Error('unexpected')
    const next = jest.fn().mockImplementationOnce(() => {
      throw error
    })

    const ctxThrowSpy = jest.spyOn(ctx, 'throw')

    await expect(gnapServerErrorMiddleware(ctx, next)).rejects.toThrow()
    expect(ctxThrowSpy).toHaveBeenCalledWith(500)
    expect(next).toHaveBeenCalledTimes(1)
  })
})
