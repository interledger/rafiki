import { AxiosInstance } from 'axios'
import { createCardService } from './service'
import { Logger } from 'pino'

describe('Card Service', () => {
  let mockAxios: Partial<AxiosInstance>
  let cardServiceHost: string
  let mockLogger: Partial<Logger>
  let cardService: Awaited<ReturnType<typeof createCardService>>

  beforeAll(async () => {
    mockAxios = {
      post: jest.fn()
    }
    mockLogger = {
      error: jest.fn(),
      child: jest.fn().mockReturnThis()
    }
    cardServiceHost = 'http://card-service.test'
    cardService = await createCardService({
      axios: mockAxios as AxiosInstance,
      cardServiceHost,
      logger: mockLogger as Logger
    })
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('sendPaymentEvent', () => {
    const eventDetails = {
      requestId: 'req-123',
      outgoingPaymentId: 'out-456',
      resultCode: 'completed'
    }

    test('sends payment event to the correct endpoint', async () => {
      ;(mockAxios.post as jest.Mock).mockResolvedValueOnce({ status: 200 })
      await expect(
        cardService.sendPaymentEvent(eventDetails)
      ).resolves.toBeUndefined()
      expect(mockAxios.post).toHaveBeenCalledWith(
        `${cardServiceHost}/payment-event`,
        eventDetails
      )
    })

    test('propagates errors from axios', async () => {
      const error = new Error('network error')
      ;(mockAxios.post as jest.Mock).mockRejectedValueOnce(error)
      await expect(cardService.sendPaymentEvent(eventDetails)).rejects.toThrow(
        'network error'
      )
    })

    test('logs and throws if response status is not 200', async () => {
      ;(mockAxios.post as jest.Mock).mockResolvedValueOnce({ status: 500 })
      await expect(cardService.sendPaymentEvent(eventDetails)).rejects.toThrow(
        `Failed to send payment event with details ${JSON.stringify(eventDetails)}`
      )
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 500,
          eventDetails
        }),
        'Failed to send payment event'
      )
    })
  })
})
