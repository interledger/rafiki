import { createILPContext } from '../../utils'
import { RafikiServicesFactory } from '../../factories'
import { createIncomingErrorHandlerMiddleware } from '../../middleware/error-handler'

describe('Error Handler Middleware', () => {
  const ADDRESS = 'test.rafiki'
  const services = RafikiServicesFactory.build({})

  test('catches errors and converts into ilp reject', async () => {
    const ctx = createILPContext({ services })
    const errorToBeThrown = new Error('Test Error')
    const next = jest.fn().mockImplementation(() => {
      throw errorToBeThrown
    })
    const middleware = createIncomingErrorHandlerMiddleware(ADDRESS)

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(ctx.response.reject).toBeDefined()
    expect(ctx.services.logger.debug).toHaveBeenCalledWith(
      {
        err: errorToBeThrown
      },
      'Error thrown in incoming pipeline'
    )
    expect(ctx.revertTotalReceived).toBeUndefined()
  })

  test('catches ilp error and converts into ilp reject', async () => {
    const ctx = createILPContext({ services })
    const errorToBeThrown = new Error('Test Error')
    errorToBeThrown['ilpErrorCode'] = 'T00'

    const next = jest.fn().mockImplementation(() => {
      throw errorToBeThrown
    })
    const middleware = createIncomingErrorHandlerMiddleware(ADDRESS)

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(ctx.response.reject).toBeDefined()
    expect(ctx.services.logger.debug).toHaveBeenCalledWith(
      {
        err: errorToBeThrown
      },
      'Error thrown in incoming pipeline'
    )
    expect(ctx.revertTotalReceived).toBeUndefined()
  })

  test('sets triggeredBy to own address if error is thrown in next', async () => {
    const ctx = createILPContext({ services })
    const errorToBeThrown = new Error('Test Error')
    const next = jest.fn().mockImplementation(() => {
      throw errorToBeThrown
    })
    const middleware = createIncomingErrorHandlerMiddleware(ADDRESS)

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(ctx.response.reject).toBeDefined()
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(ctx.response.reject!.triggeredBy).toEqual(ADDRESS)
    expect(ctx.revertTotalReceived).toBeUndefined()
  })

  test('creates reject if reply is not set in next', async () => {
    const ctx = createILPContext({ services })
    const next = jest.fn().mockImplementation(() => {
      // don't set reply
    })
    const middleware = createIncomingErrorHandlerMiddleware(ADDRESS)

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(ctx.response.reject).toBeDefined()
    expect(ctx.services.logger.error).toHaveBeenCalledWith(
      'handler did not return a valid value.'
    )
    expect(ctx.revertTotalReceived).toBeUndefined()
  })

  test('reverts stream connection total received amount', async () => {
    const ctx = createILPContext({ services })
    const errorToBeThrown = new Error('Test Error')
    const next = jest.fn().mockImplementation(() => {
      ctx.revertTotalReceived = jest.fn().mockResolvedValueOnce('0')
      throw errorToBeThrown
    })
    const middleware = createIncomingErrorHandlerMiddleware(ADDRESS)

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(ctx.response.reject).toBeDefined()

    expect(ctx.revertTotalReceived).toEqual(expect.any(Function))
    expect(ctx.revertTotalReceived).toHaveBeenCalledTimes(1)
  })
})
