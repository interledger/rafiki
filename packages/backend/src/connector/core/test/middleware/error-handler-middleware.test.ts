import { createContext } from '../../utils'
import { RafikiContext } from '../../rafiki'
import { RafikiServicesFactory } from '../../factories'
import { createIncomingErrorHandlerMiddleware } from '../../middleware/error-handler'

describe('Error Handler Middleware', () => {
  const ADDRESS = 'test.rafiki'
  const services = RafikiServicesFactory.build({})

  test('catches errors and converts into ilp reject', async () => {
    const ctx = createContext<unknown, RafikiContext>()
    const errorToBeThrown = new Error('Test Error')
    const next = jest.fn().mockImplementation(() => {
      throw errorToBeThrown
    })
    ctx.services = services
    const middleware = createIncomingErrorHandlerMiddleware(ADDRESS)

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(ctx.response.reject).toBeDefined()
    expect(ctx.services.logger.error).toHaveBeenCalledWith(
      {
        err: errorToBeThrown
      },
      'Error thrown in incoming pipeline'
    )
  })

  test('sets triggeredBy to own address if error is thrown in next', async () => {
    const ctx = createContext<unknown, RafikiContext>()
    const errorToBeThrown = new Error('Test Error')
    const next = jest.fn().mockImplementation(() => {
      throw errorToBeThrown
    })
    ctx.services = services
    const middleware = createIncomingErrorHandlerMiddleware(ADDRESS)

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(ctx.response.reject).toBeDefined()
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(ctx.response.reject!.triggeredBy).toEqual(ADDRESS)
  })

  test('creates reject if reply is not set in next', async () => {
    const ctx = createContext<unknown, RafikiContext>()
    const next = jest.fn().mockImplementation(() => {
      // don't set reply
    })
    ctx.services = services
    const middleware = createIncomingErrorHandlerMiddleware(ADDRESS)

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(ctx.response.reject).toBeDefined()
    expect(ctx.services.logger.error).toHaveBeenCalledWith(
      'handler did not return a valid value.'
    )
  })
})
