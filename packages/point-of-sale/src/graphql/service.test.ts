import { createGraphQLService } from './service'
import { ApolloClient, NormalizedCacheObject } from '@apollo/client'
import { Logger } from 'pino'
import { AmountInput, Mutation } from './generated/graphql'
import { IAppConfig } from '../config/app'

const mockLogger = {
  child: jest.fn().mockReturnThis(),
  error: jest.fn(),
} as unknown as Logger

const mockConfig = {}

const mockApolloClient = {
  mutate: jest.fn()
} as unknown as ApolloClient<NormalizedCacheObject>

const deps = {
  logger: mockLogger,
  config: mockConfig as IAppConfig,
  apolloClient: mockApolloClient
}

describe('createGraphQLService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should create an incoming payment and return the wallet address url', async () => {
    const expectedUrl = 'https://wallet.example.com/address/123'
    mockApolloClient.mutate = jest.fn().mockResolvedValue({
      data: {
        payment: {
          client: expectedUrl
        }
      }
    })
    const service = createGraphQLService(deps)
    const walletAddressId = 'wallet-123'
    const incomingAmount: AmountInput = { value: 1000n, assetCode: 'USD', assetScale: 2 }
    const result = await service.createIncomingPayment(walletAddressId, incomingAmount)
    expect(result).toBe(expectedUrl)
    expect(mockApolloClient.mutate).toHaveBeenCalled()
  })

  it('should throw and log error if payment creation fails', async () => {
    mockApolloClient.mutate = jest.fn().mockResolvedValue({ data: { payment: { client: undefined } } })
    const service = createGraphQLService(deps)
    const walletAddressId = 'wallet-123'
    const incomingAmount: AmountInput = { value: 1000n, assetCode: 'USD', assetScale: 2 }
    await expect(service.createIncomingPayment(walletAddressId, incomingAmount)).rejects.toThrow(
      /Failed to create incoming payment/
    )
    expect(mockLogger.error).toHaveBeenCalledWith(
      { walletAddressId },
      'Failed to create incoming payment for given walletAddressId'
    )
  })
}) 