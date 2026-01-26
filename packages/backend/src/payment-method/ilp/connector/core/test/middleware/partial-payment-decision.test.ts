import { Errors } from 'ilp-packet'
import { ZeroCopyIlpPrepare } from '../..'
import { createILPContext } from '../../utils'
import { IlpPrepareFactory, RafikiServicesFactory } from '../../factories'
import { createPartialPaymentDecisionMiddleware } from '../../middleware/partial-payment-decision'
import { StreamState } from '../../middleware/stream-address'
import { StreamServer } from '@interledger/stream-receiver'
import { IncomingPayment } from '../../../../../../open_payments/payment/incoming/model'

const { FinalApplicationError } = Errors

describe('Partial Payment Decision Middleware', function () {
  const services = RafikiServicesFactory.build()
  const middleware = createPartialPaymentDecisionMiddleware()

  // Mock the incomingPayments service
  const mockProcessPartialPayment = jest.fn()
  services.incomingPayments = {
    ...services.incomingPayments,
    processPartialPayment: mockProcessPartialPayment
  } as any

  function makeContext(streamState?: Partial<StreamState>) {
    const ctx = createILPContext<StreamState>({
      services,
      state: {
        streamDestination: 'test-payment-id',
        hasAdditionalData: true,
        streamServer: new StreamServer({
          serverAddress: services.config.ilpAddress,
          serverSecret: services.config.streamSecret
        }),
        ...streamState
      }
    })
    return ctx
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockProcessPartialPayment.mockClear()
  })

  test('skips when streamDestination is not set', async () => {
    const ctx = makeContext({ streamDestination: undefined })
    const prepare = IlpPrepareFactory.build()
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)
    const next = jest.fn()

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(next).toHaveBeenCalledTimes(1)
    expect(mockProcessPartialPayment).not.toHaveBeenCalled()
  })

  test('skips when hasAdditionalData is false', async () => {
    const ctx = makeContext({ hasAdditionalData: false })
    const prepare = IlpPrepareFactory.build()
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)
    const next = jest.fn()

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(next).toHaveBeenCalledTimes(1)
    expect(mockProcessPartialPayment).not.toHaveBeenCalled()
  })

  test('calls processPartialPayment with correct parameters', async () => {
    const incomingPaymentId = 'test-payment-id'
    const ctx = makeContext({
      streamDestination: incomingPaymentId
    })
    const prepare = IlpPrepareFactory.build()
    const expiresAt = new Date(Date.now() + 30000)
    prepare.expiresAt = expiresAt
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)

    const mockIncomingPayment = {
      id: incomingPaymentId
    } as IncomingPayment

    mockProcessPartialPayment.mockResolvedValue({
      incomingPayment: mockIncomingPayment,
      decision: 'Additional data approved'
    })

    const next = jest.fn()

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(mockProcessPartialPayment).toHaveBeenCalledWith(
      incomingPaymentId,
      expect.objectContaining({
        dataToTransmit: undefined,
        expiresAt
      })
    )
    expect(next).toHaveBeenCalledTimes(1)
  })

  test('extracts additional data from STREAM frames', async () => {
    const incomingPaymentId = 'test-payment-id'
    const additionalData = 'test-data'
    const ctx = makeContext({
      streamDestination: incomingPaymentId
    })

    const streamServer = ctx.state.streamServer
    if (!streamServer) {
      throw new Error('streamServer should be defined in this test')
    }
    const credentials = streamServer.generateCredentials({
      paymentTag: incomingPaymentId
    })

    const prepare = IlpPrepareFactory.build({
      destination: credentials.ilpAddress,
      expiresAt: new Date(Date.now() + 30000)
    })
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)

    // Mock the streamServer.createReply to return frames with data
    const mockReply = {
      dataFrames: [
        {
          streamId: 1,
          offset: '0',
          data: Buffer.from(additionalData, 'utf8')
        }
      ]
    }
    if (!ctx.state.streamServer) {
      throw new Error('streamServer should be defined in this test')
    }
    jest
      .spyOn(ctx.state.streamServer, 'createReply')
      .mockReturnValue(mockReply as any)

    const mockIncomingPayment = {
      id: incomingPaymentId
    } as IncomingPayment

    mockProcessPartialPayment.mockResolvedValue({
      incomingPayment: mockIncomingPayment,
      decision: 'Additional data approved'
    })

    const next = jest.fn()

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(mockProcessPartialPayment).toHaveBeenCalledWith(
      incomingPaymentId,
      expect.objectContaining({
        dataToTransmit: additionalData,
        expiresAt: prepare.expiresAt
      })
    )
  })

  test('allows when decision is "Additional data approved"', async () => {
    const ctx = makeContext()
    const prepare = IlpPrepareFactory.build({
      expiresAt: new Date(Date.now() + 30000)
    })
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)

    const mockIncomingPayment = {
      id: 'test-payment-id'
    } as IncomingPayment

    mockProcessPartialPayment.mockResolvedValue({
      incomingPayment: mockIncomingPayment,
      decision: 'Additional data approved'
    })

    const next = jest.fn()

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(next).toHaveBeenCalledTimes(1)
  })

  test('throws FinalApplicationError when decision is not approved', async () => {
    const ctx = makeContext()
    const prepare = IlpPrepareFactory.build({
      expiresAt: new Date(Date.now() + 30000)
    })
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)

    const mockIncomingPayment = {
      id: 'test-payment-id'
    } as IncomingPayment

    const rejectionReason = 'Data validation failed'
    mockProcessPartialPayment.mockResolvedValue({
      incomingPayment: mockIncomingPayment,
      decision: rejectionReason
    })

    const next = jest.fn()

    await expect(middleware(ctx, next)).rejects.toBeInstanceOf(
      FinalApplicationError
    )

    expect(next).not.toHaveBeenCalled()
  })

  test('throws FinalApplicationError with correct message when decision is not approved', async () => {
    const ctx = makeContext()
    const prepare = IlpPrepareFactory.build({
      expiresAt: new Date(Date.now() + 30000)
    })
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)

    const mockIncomingPayment = {
      id: 'test-payment-id'
    } as IncomingPayment

    const rejectionReason = 'Data validation failed'
    mockProcessPartialPayment.mockResolvedValue({
      incomingPayment: mockIncomingPayment,
      decision: rejectionReason
    })

    const next = jest.fn()

    try {
      await middleware(ctx, next)
      fail('Expected FinalApplicationError to be thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(FinalApplicationError)
      if (error instanceof FinalApplicationError) {
        expect(error.message).toBe('Data failed verification')
        expect(error.ilpErrorData.toString('utf8')).toBe(rejectionReason)
      }
    }
  })

  test('handles errors from processPartialPayment', async () => {
    const ctx = makeContext()
    const prepare = IlpPrepareFactory.build({
      expiresAt: new Date(Date.now() + 30000)
    })
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)

    const error = new Error('Unknown incoming payment')
    mockProcessPartialPayment.mockRejectedValue(error)

    const next = jest.fn()

    await expect(middleware(ctx, next)).rejects.toBeInstanceOf(
      FinalApplicationError
    )

    expect(services.logger.error).toHaveBeenCalledWith(
      { error, incomingPaymentId: 'test-payment-id' },
      'failed to process partial payment'
    )
    expect(next).not.toHaveBeenCalled()
  })

  test('throws FinalApplicationError with generic message on service error', async () => {
    const ctx = makeContext()
    const prepare = IlpPrepareFactory.build({
      expiresAt: new Date(Date.now() + 30000)
    })
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)

    const error = new Error('Database error')
    mockProcessPartialPayment.mockRejectedValue(error)

    const next = jest.fn()

    try {
      await middleware(ctx, next)
      fail('Expected FinalApplicationError to be thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(FinalApplicationError)
      if (err instanceof FinalApplicationError) {
        expect(err.message).toBe('Data failed verification')
        expect(err.ilpErrorData.toString('utf8')).toBe(
          'Error processing partial payment'
        )
      }
    }
  })

  test('handles missing streamServer gracefully when extracting data', async () => {
    const ctx = makeContext({ streamServer: undefined })
    const prepare = IlpPrepareFactory.build({
      expiresAt: new Date(Date.now() + 30000)
    })
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)

    const mockIncomingPayment = {
      id: 'test-payment-id'
    } as IncomingPayment

    mockProcessPartialPayment.mockResolvedValue({
      incomingPayment: mockIncomingPayment,
      decision: 'Additional data approved'
    })

    const next = jest.fn()

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(mockProcessPartialPayment).toHaveBeenCalledWith(
      'test-payment-id',
      expect.objectContaining({
        dataToTransmit: undefined
      })
    )
  })
})
