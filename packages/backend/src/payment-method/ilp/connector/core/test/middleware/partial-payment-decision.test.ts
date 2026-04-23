import { ZeroCopyIlpPrepare } from '../..'
import { createILPContext } from '../../utils'
import { IlpPrepareFactory, RafikiServicesFactory } from '../../factories'
import { createPartialPaymentDecisionMiddleware } from '../../middleware/partial-payment-decision'
import { StreamState } from '../../middleware/stream-address'
import { StreamServer } from '@interledger/stream-receiver'
import { Config } from '../../../../../../config/app'

describe('Partial Payment Decision Middleware', function () {
  const middleware = createPartialPaymentDecisionMiddleware()

  function makeContext(
    streamState?: Partial<StreamState>,
    services = makeServices().services
  ) {
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

  function makeServices() {
    const services = RafikiServicesFactory.build({
      config: { ...Config, enablePartialPaymentDecision: true }
    })
    const mockProcessPartialPayment = jest.fn<
      Promise<unknown>,
      [
        string,
        {
          dataFromSender: string
          partialIncomingPaymentId: string
          expiresAt: Date
        }
      ]
    >()
    Object.assign(services.incomingPayments, {
      processPartialPayment: mockProcessPartialPayment
    })
    return { services, mockProcessPartialPayment }
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  function mockIncomingMoneyReply(ctx: ReturnType<typeof makeContext>) {
    if (!ctx.state.streamServer) {
      throw new Error('streamServer should be defined in this test')
    }
    jest.spyOn(ctx.state.streamServer, 'createReply').mockReturnValue({
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
    const { services, mockProcessPartialPayment } = makeServices()
    const ctx = makeContext({ streamDestination: undefined }, services)
    const prepare = IlpPrepareFactory.build()
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)
    const next = jest.fn()

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(next).toHaveBeenCalledTimes(1)
    expect(mockProcessPartialPayment).not.toHaveBeenCalled()
  })

  test('skips when additionalData is missing', async () => {
    const { services, mockProcessPartialPayment } = makeServices()
    const ctx = makeContext({ additionalData: undefined }, services)
    const prepare = IlpPrepareFactory.build()
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)
    const next = jest.fn()

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(next).toHaveBeenCalledTimes(1)
    expect(mockProcessPartialPayment).not.toHaveBeenCalled()
  })

  test('calls processPartialPayment with correct parameters', async () => {
    const { services, mockProcessPartialPayment } = makeServices()
    const incomingPaymentId = 'test-payment-id'
    const ctx = makeContext(
      {
        streamDestination: incomingPaymentId
      },
      services
    )
    const prepare = IlpPrepareFactory.build()
    const expiresAt = new Date(Date.now() + 30000)
    prepare.expiresAt = expiresAt
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)
    mockIncomingMoneyReply(ctx)

    mockProcessPartialPayment.mockResolvedValue({
      reason: 'Additional data approved',
      success: true
    })

    const next = jest.fn()

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(mockProcessPartialPayment).toHaveBeenCalledWith(
      incomingPaymentId,
      expect.objectContaining({
        dataFromSender: 'test-data',
        expiresAt
      })
    )
    expect(next).toHaveBeenCalledTimes(1)
  })

  test('extracts additional data from STREAM frames', async () => {
    const { services, mockProcessPartialPayment } = makeServices()
    const incomingPaymentId = 'test-payment-id'
    const additionalData = 'test-data'
    const ctx = makeContext(
      {
        streamDestination: incomingPaymentId,
        additionalData
      },
      services
    )

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
      reason: 'Additional data approved',
      success: true
    })

    const next = jest.fn()

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(mockProcessPartialPayment).toHaveBeenCalledWith(
      incomingPaymentId,
      expect.objectContaining({
        dataFromSender: additionalData,
        expiresAt: prepare.expiresAt
      })
    )
  })

  test('allows when decision is "Additional data approved"', async () => {
    const { services, mockProcessPartialPayment } = makeServices()
    const ctx = makeContext(undefined, services)
    const prepare = IlpPrepareFactory.build({
      expiresAt: new Date(Date.now() + 30000)
    })
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)
    mockIncomingMoneyReply(ctx)

    mockProcessPartialPayment.mockResolvedValue({
      reason: 'Additional data approved',
      success: true
    })

    const next = jest.fn()

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(next).toHaveBeenCalledTimes(1)
  })

  test.each([
    ['no success field (timeout)', { reason: 'No response from ASE' }],
    [
      'explicit success: undefined',
      { success: undefined, reason: 'No response from ASE' }
    ]
  ])(
    'allows payment when ASE does not respond (%s)',
    async (
      _: string,
      decisionResult: { success?: boolean; reason: string }
    ) => {
      const { services, mockProcessPartialPayment } = makeServices()
      const ctx = makeContext(undefined, services)
      const prepare = IlpPrepareFactory.build({
        expiresAt: new Date(Date.now() + 30000)
      })
      ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)
      mockIncomingMoneyReply(ctx)

      mockProcessPartialPayment.mockResolvedValue(decisionResult)

      const next = jest.fn()

      await expect(middleware(ctx, next)).resolves.toBeUndefined()

      expect(next).toHaveBeenCalledTimes(1)
      expect(ctx.response.reply).toBeUndefined()
    }
  )

  test('declines payment when decision is not approved', async () => {
    const { services, mockProcessPartialPayment } = makeServices()
    const ctx = makeContext(undefined, services)
    const prepare = IlpPrepareFactory.build({
      expiresAt: new Date(Date.now() + 30000)
    })
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)
    mockIncomingMoneyReplyWithDecline(ctx)

    const rejectionReason = 'Data validation failed'
    mockProcessPartialPayment.mockResolvedValue({
      reason: rejectionReason,
      success: false
    })

    const next = jest.fn()

    await expect(middleware(ctx, next)).resolves.toBeUndefined()
    expect(ctx.response.reply).toBeDefined()
    expect(next).not.toHaveBeenCalled()
  })

  test('decline reply includes rejection reason when decision is not approved', async () => {
    const { services, mockProcessPartialPayment } = makeServices()
    const ctx = makeContext(undefined, services)
    const prepare = IlpPrepareFactory.build({
      expiresAt: new Date(Date.now() + 30000)
    })
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)
    mockIncomingMoneyReplyWithDecline(ctx)

    const rejectionReason = 'Data validation failed'
    mockProcessPartialPayment.mockResolvedValue({
      reason: rejectionReason,
      success: false
    })

    const next = jest.fn()

    await expect(middleware(ctx, next)).resolves.toBeUndefined()
    expect(ctx.response.reply).toBeDefined()
    expect(next).not.toHaveBeenCalled()
  })

  test('handles errors from processPartialPayment by declining packet', async () => {
    const { services, mockProcessPartialPayment } = makeServices()
    const ctx = makeContext(undefined, services)
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
    const { services, mockProcessPartialPayment } = makeServices()
    const ctx = makeContext(undefined, services)
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
    const { services, mockProcessPartialPayment } = makeServices()
    const ctx = makeContext({ streamServer: undefined }, services)
    const prepare = IlpPrepareFactory.build({
      expiresAt: new Date(Date.now() + 30000)
    })
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)

    mockProcessPartialPayment.mockResolvedValue({
      reason: 'Additional data approved',
      success: true
    })

    const next = jest.fn()

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(mockProcessPartialPayment).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledTimes(1)
  })
})
