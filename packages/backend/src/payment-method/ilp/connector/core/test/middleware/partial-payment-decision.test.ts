import { ZeroCopyIlpPrepare } from '../..'
import { createILPContext } from '../../utils'
import { IlpPrepareFactory, RafikiServicesFactory } from '../../factories'
import { createPartialPaymentDecisionMiddleware } from '../../middleware/partial-payment-decision'
import { StreamState } from '../../middleware/stream-address'
import { StreamServer } from '@interledger/stream-receiver'

describe('Partial Payment Decision Middleware', function () {
  const services = RafikiServicesFactory.build()
  const middleware = createPartialPaymentDecisionMiddleware()

  const mockProcessPartialPayment = jest.spyOn(
    services.incomingPayments,
    'processPartialPayment'
  )

  function makeContext(streamState?: Partial<StreamState>) {
    const ctx = createILPContext<StreamState>({
      services,
      state: {
        streamDestination: 'test-payment-id',
        additionalData: 'test-data',
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

  function mockIncomingMoneyReply(ctx: ReturnType<typeof makeContext>) {
    if (!ctx.state.streamServer) {
      throw new Error('streamServer should be defined in this test')
    }
    jest
      .spyOn(ctx.state.streamServer, 'createReply')
      .mockReturnValue({
        packet: Buffer.from('mock-packet')
      } as unknown as ReturnType<StreamServer['createReply']>)
  }

  function mockIncomingMoneyReplyWithDecline(
    ctx: ReturnType<typeof makeContext>
  ) {
    if (!ctx.state.streamServer) {
      throw new Error('streamServer should be defined in this test')
    }
    jest.spyOn(ctx.state.streamServer, 'createReply').mockReturnValue({
      packet: Buffer.from('mock-packet'),
      finalDecline: jest.fn().mockReturnValue(Buffer.from('declined', 'utf8'))
    } as unknown as ReturnType<StreamServer['createReply']>)
  }

  test('skips when streamDestination is not set', async () => {
    const ctx = makeContext({ streamDestination: undefined })
    const prepare = IlpPrepareFactory.build()
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)
    const next = jest.fn()

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(next).toHaveBeenCalledTimes(1)
    expect(mockProcessPartialPayment).not.toHaveBeenCalled()
  })

  test('skips when additionalData is missing', async () => {
    const ctx = makeContext({ additionalData: undefined })
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
    mockIncomingMoneyReply(ctx)

    mockProcessPartialPayment.mockResolvedValue({
      message: 'Additional data approved',
      success: true
    })

    const next = jest.fn()

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(mockProcessPartialPayment).toHaveBeenCalledWith(
      incomingPaymentId,
      expect.objectContaining({
        dataToTransmit: 'test-data',
        expiresAt
      })
    )
    expect(next).toHaveBeenCalledTimes(1)
  })

  test('extracts additional data from STREAM frames', async () => {
    const incomingPaymentId = 'test-payment-id'
    const additionalData = 'test-data'
    const ctx = makeContext({
      streamDestination: incomingPaymentId,
      additionalData
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

    // Mock the streamServer.createReply to return incoming money
    const mockReply = { packet: Buffer.from('mock-packet') }
    if (!ctx.state.streamServer) {
      throw new Error('streamServer should be defined in this test')
    }
    jest
      .spyOn(ctx.state.streamServer, 'createReply')
      .mockReturnValue(
        mockReply as unknown as ReturnType<StreamServer['createReply']>
      )

    mockProcessPartialPayment.mockResolvedValue({
      message: 'Additional data approved',
      success: true
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
    mockIncomingMoneyReply(ctx)

    mockProcessPartialPayment.mockResolvedValue({
      message: 'Additional data approved',
      success: true
    })

    const next = jest.fn()

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(next).toHaveBeenCalledTimes(1)
  })

  test('declines payment when decision is not approved', async () => {
    const ctx = makeContext()
    const prepare = IlpPrepareFactory.build({
      expiresAt: new Date(Date.now() + 30000)
    })
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)
    mockIncomingMoneyReplyWithDecline(ctx)

    const rejectionReason = 'Data validation failed'
    mockProcessPartialPayment.mockResolvedValue({
      message: rejectionReason,
      success: false
    })

    const next = jest.fn()

    await expect(middleware(ctx, next)).resolves.toBeUndefined()
    expect(ctx.response.reply).toBeDefined()
    expect(next).not.toHaveBeenCalled()
  })

  test('decline reply includes rejection reason when decision is not approved', async () => {
    const ctx = makeContext()
    const prepare = IlpPrepareFactory.build({
      expiresAt: new Date(Date.now() + 30000)
    })
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)
    mockIncomingMoneyReplyWithDecline(ctx)

    const rejectionReason = 'Data validation failed'
    mockProcessPartialPayment.mockResolvedValue({
      message: rejectionReason,
      success: false
    })

    const next = jest.fn()

    await expect(middleware(ctx, next)).resolves.toBeUndefined()
    expect(ctx.response.reply).toBeDefined()
    expect(next).not.toHaveBeenCalled()
  })

  test('handles errors from processPartialPayment by declining packet', async () => {
    const ctx = makeContext()
    const prepare = IlpPrepareFactory.build({
      expiresAt: new Date(Date.now() + 30000)
    })
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)
    mockIncomingMoneyReplyWithDecline(ctx)

    const error = new Error('Unknown incoming payment')
    mockProcessPartialPayment.mockRejectedValue(error)

    const next = jest.fn()

    await expect(middleware(ctx, next)).resolves.toBeUndefined()
    expect(services.logger.error).toHaveBeenCalledWith(
      { error, incomingPaymentId: 'test-payment-id' },
      'failed to process partial payment'
    )
    expect(ctx.response.reply).toBeDefined()
    expect(next).not.toHaveBeenCalled()
  })

  test('uses generic decline message on service error', async () => {
    const ctx = makeContext()
    const prepare = IlpPrepareFactory.build({
      expiresAt: new Date(Date.now() + 30000)
    })
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)
    mockIncomingMoneyReplyWithDecline(ctx)

    const error = new Error('Database error')
    mockProcessPartialPayment.mockRejectedValue(error)

    const next = jest.fn()

    await expect(middleware(ctx, next)).resolves.toBeUndefined()
    expect(ctx.response.reply).toBeDefined()
    expect(next).not.toHaveBeenCalled()
  })

  test('handles missing streamServer gracefully when extracting data', async () => {
    const ctx = makeContext({ streamServer: undefined })
    const prepare = IlpPrepareFactory.build({
      expiresAt: new Date(Date.now() + 30000)
    })
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)

    mockProcessPartialPayment.mockResolvedValue({
      message: 'Additional data approved',
      success: true
    })

    const next = jest.fn()

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(mockProcessPartialPayment).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledTimes(1)
  })
})
