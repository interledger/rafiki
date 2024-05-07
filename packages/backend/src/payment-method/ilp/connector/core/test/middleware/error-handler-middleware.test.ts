import { createILPContext } from '../../utils'
import { RafikiServicesFactory } from '../../factories'
import { createIncomingErrorHandlerMiddleware } from '../../middleware/error-handler'
import { errorToIlpReject, IlpErrorCode, isIlpError } from 'ilp-packet'
import assert from 'assert'

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
    expect(ctx.services.logger.info).toHaveBeenCalledWith(
      {
        err: errorToBeThrown
      },
      'Error thrown in incoming pipeline'
    )
    expect(ctx.response.reject).toEqual({
      message: 'unexpected internal error',
      code: IlpErrorCode.T00_INTERNAL_ERROR,
      triggeredBy: ADDRESS,
      data: expect.any(Object)
    })
    expect(ctx.revertTotalReceived).toBeUndefined()
  })

  test('catches ilp error and converts into ilp reject', async () => {
    class IlpError extends Error {
      private ilpErrorCode!: IlpErrorCode
    }
    const ctx = createILPContext({ services })
    const errorToBeThrown = new IlpError('Test Error')
    errorToBeThrown['ilpErrorCode'] = IlpErrorCode.T00_INTERNAL_ERROR
    assert.ok(isIlpError(errorToBeThrown))
    const next = jest.fn().mockImplementation(() => {
      throw errorToBeThrown
    })
    const middleware = createIncomingErrorHandlerMiddleware(ADDRESS)
    await expect(middleware(ctx, next)).resolves.toBeUndefined()
    expect(ctx.response.reject).toEqual(
      errorToIlpReject(ADDRESS, errorToBeThrown)
    )
    expect(ctx.services.logger.info).toHaveBeenCalledWith(
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
    expect(ctx.response.reject).toEqual({
      message: 'unexpected internal error',
      code: IlpErrorCode.T00_INTERNAL_ERROR,
      triggeredBy: ADDRESS,
      data: expect.any(Object)
    })
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
    expect(ctx.response.reject).toEqual({
      message: 'unexpected internal error',
      code: IlpErrorCode.T00_INTERNAL_ERROR,
      triggeredBy: ADDRESS,
      data: expect.any(Object)
    })
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
    expect(ctx.response.reject).toEqual({
      message: 'unexpected internal error',
      code: IlpErrorCode.T00_INTERNAL_ERROR,
      triggeredBy: ADDRESS,
      data: expect.any(Object)
    })
    expect(ctx.revertTotalReceived).toEqual(expect.any(Function))
    expect(ctx.revertTotalReceived).toHaveBeenCalledTimes(1)
  })
})
