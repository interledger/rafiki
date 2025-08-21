import { PaymentService, createPaymentService } from './service'
import { ApolloClient, NormalizedCacheObject } from '@apollo/client'
import { Logger } from 'pino'
import { AmountInput } from '../graphql/generated/graphql'
import { IAppConfig } from '../config/app'
import { v4 as uuid } from 'uuid'
import { AxiosInstance } from 'axios'

const mockLogger = {
  child: jest.fn().mockReturnThis(),
  error: jest.fn()
} as unknown as Logger

const mockConfig = {}

const mockApolloClient = {
  mutate: jest.fn()
} as unknown as ApolloClient<NormalizedCacheObject>

const mockAxios: Partial<AxiosInstance> = {
  get: jest.fn()
}

const deps = {
  logger: mockLogger,
  config: mockConfig as IAppConfig,
  apolloClient: mockApolloClient,
  axios: mockAxios as AxiosInstance
}

describe('createPaymentService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should create an incoming payment and return the incoming payment url (id)', async () => {
    const expectedUrl = 'https://api.example.com/incoming-payments/abc123'
    mockApolloClient.mutate = jest.fn().mockResolvedValue({
      data: {
        payment: {
          id: expectedUrl
        }
      }
    })
    const service = createPaymentService(deps)
    const walletAddressId = 'wallet-123'
    const incomingAmount: AmountInput = {
      value: 1000n,
      assetCode: 'USD',
      assetScale: 2
    }
    const result = await service.createIncomingPayment(
      walletAddressId,
      incomingAmount
    )
    expect(result).toBe(expectedUrl)
    expect(mockApolloClient.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: {
          walletAddressId,
          incomingAmount,
          idempotencyKey: expect.any(String),
          isCardPayment: true
        }
      })
    )
  })

  it('should throw and log error if payment creation fails (no id)', async () => {
    mockApolloClient.mutate = jest
      .fn()
      .mockResolvedValue({ data: { payment: undefined } })
    const service = createPaymentService(deps)
    const walletAddressId = 'wallet-123'
    const incomingAmount: AmountInput = {
      value: 1000n,
      assetCode: 'USD',
      assetScale: 2
    }
    await expect(
      service.createIncomingPayment(walletAddressId, incomingAmount)
    ).rejects.toThrow(/Failed to create incoming payment/)
    expect(mockLogger.error).toHaveBeenCalledWith(
      { walletAddressId },
      'Failed to create incoming payment for given walletAddressId'
    )
  })
})

describe('getWalletAddress', () => {
  let service: PaymentService
  const WALLET_ADDRESS_URL = 'https://api.example.com/wallet-address'

  beforeAll(() => {
    service = createPaymentService(deps)
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('should obtain wallet address successfully', async () => {
    ;(mockAxios.get as jest.Mock).mockResolvedValueOnce({
      data: {
        id: uuid(),
        publicName: 'wallet-address-name',
        assetCode: 'USD',
        assetScale: 1,
        authServer: 'auth-server',
        resourceServer: 'resource-server',
        cardService: 'card-service-url'
      }
    })
    const walletAddress = await service.getWalletAddress(WALLET_ADDRESS_URL)
    expect(walletAddress).toMatchObject({
      publicName: 'wallet-address-name',
      assetCode: 'USD',
      assetScale: 1,
      authServer: 'auth-server',
      resourceServer: 'resource-server',
      cardService: 'card-service-url'
    })
  })

  test('should throw when no wallet address was found', async () => {
    ;(mockAxios.get as jest.Mock).mockResolvedValueOnce({ data: undefined })
    await expect(service.getWalletAddress(WALLET_ADDRESS_URL)).rejects.toThrow(
      'No wallet address was found'
    )
  })

  test("should throw when the wallet address doesn't have cardServiceUrl", async () => {
    ;(mockAxios.get as jest.Mock).mockResolvedValueOnce({
      data: {
        id: uuid(),
        publicName: 'wallet-address-name',
        assetCode: 'USD',
        assetScale: 1,
        authServer: 'auth-server',
        resourceServer: 'resource-server',
        cardService: undefined
      }
    })

    await expect(service.getWalletAddress(WALLET_ADDRESS_URL)).rejects.toThrow(
      'Missing card service URL'
    )
  })
})
