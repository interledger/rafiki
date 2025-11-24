import { PaymentService, createPaymentService } from './service'
import { ApolloClient, NormalizedCacheObject } from '@apollo/client'
import { Logger } from 'pino'
import { AmountInput, IncomingPaymentState } from '../graphql/generated/graphql'
import { IAppConfig } from '../config/app'
import { v4 as uuid, v4 } from 'uuid'
import { AxiosInstance } from 'axios'
import { faker } from '@faker-js/faker'
import { GET_WALLET_ADDRESS_BY_URL } from '../graphql/queries/getWalletAddress'

const mockLogger = {
  child: jest.fn().mockReturnThis(),
  error: jest.fn()
} as unknown as Logger

const mockConfig = { incomingPaymentExpiryMs: 10000 }

const mockApolloClient = {
  mutate: jest.fn(),
  query: jest.fn()
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
  afterEach(() => {
    jest.useRealTimers()
  })

  it('should create an incoming payment and return the incoming payment url (id)', async () => {
    const now = new Date().getTime()
    jest.useFakeTimers({ now })
    const uuid = v4()
    const expectedUrl = 'https://api.example.com/incoming-payments/abc123'
    mockApolloClient.mutate = jest.fn().mockResolvedValue({
      data: {
        createIncomingPayment: {
          payment: {
            id: uuid,
            url: expectedUrl
          }
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
    const expiresAt = new Date(
      now + mockConfig.incomingPaymentExpiryMs
    ).toISOString()
    const senderWalletAddress = faker.internet.url()

    const result = await service.createIncomingPayment({
      walletAddressId,
      incomingAmount,
      senderWalletAddress
    })
    expect(result).toEqual({ id: uuid, url: expectedUrl })
    expect(mockApolloClient.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: expect.objectContaining({
          input: expect.objectContaining({
            expiresAt,
            idempotencyKey: expect.any(String),
            incomingAmount,
            isCardPayment: true,
            walletAddressId,
            senderWalletAddress
          })
        })
      })
    )
  })

  it('should throw and log error if payment creation fails (no id)', async () => {
    mockApolloClient.mutate = jest.fn().mockResolvedValue({
      data: { createIncomingPayment: { payment: undefined } }
    })
    const service = createPaymentService(deps)
    const walletAddressId = 'wallet-123'
    const incomingAmount: AmountInput = {
      value: 1000n,
      assetCode: 'USD',
      assetScale: 2
    }
    await expect(
      service.createIncomingPayment({
        walletAddressId,
        incomingAmount,
        senderWalletAddress: faker.internet.url()
      })
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

describe('getWalletAddressByUrl', () => {
  let service: PaymentService
  const WALLET_ADDRESS_URL = 'https://api.example.com/wallet-address'

  beforeAll(() => {
    service = createPaymentService(deps)
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('should obtain wallet address id successfully', async () => {
    const id = uuid()
    mockApolloClient.query = jest.fn().mockResolvedValue({
      data: { walletAddressByUrl: { id } }
    })
    const walletAddressId =
      await service.getWalletAddressIdByUrl(WALLET_ADDRESS_URL)
    expect(walletAddressId).toBe(id)
  })

  test('should throw when no wallet address was found', async () => {
    mockApolloClient.query = jest.fn().mockResolvedValue({
      data: { walletAddressByUrl: undefined }
    })
    await expect(
      service.getWalletAddressIdByUrl(WALLET_ADDRESS_URL)
    ).rejects.toThrow('Wallet address not found')
  })
})

describe('get payments', (): void => {
  let service: PaymentService
  const WALLET_ADDRESS_URL = 'https://api.example.com/wallet-address'

  beforeAll(async (): Promise<void> => {
    service = createPaymentService(deps)
  })

  test('can obtain incoming payments for the wallet address', async (): Promise<void> => {
    const id = uuid()
    mockApolloClient.query = jest.fn().mockResolvedValue({
      data: {
        walletAddressByUrl: {
          id,
          incomingPayments: {
            edges: [
              {
                node: {
                  id: uuid(),
                  url: faker.internet.url(),
                  walletAddressId: id,
                  client: faker.internet.url(),
                  state: IncomingPaymentState.Pending,
                  incomingAmount: {
                    value: BigInt(500),
                    assetCode: 'USD',
                    assetScale: 2
                  },
                  receivedAmount: {
                    value: BigInt(500),
                    assetCode: 'USD',
                    assetScale: 2
                  },
                  expiresAt: new Date().toString(),
                  createdAt: new Date().toString(),
                  tenantId: uuid()
                },
                cursor: id
              }
            ],
            pageInfo: {
              endCursor: id,
              hasNextPage: false,
              hasPreviousPage: false,
              startCursor: id
            }
          }
        }
      }
    })

    const response = await service.getIncomingPayments({
      receiverWalletAddress: WALLET_ADDRESS_URL
    })
    expect(response?.edges.length).toEqual(1)
    expect(response?.edges[0].node.walletAddressId).toEqual(id)
    expect(mockApolloClient.query).toHaveBeenCalledWith({
      query: GET_WALLET_ADDRESS_BY_URL,
      variables: expect.objectContaining({
        url: WALLET_ADDRESS_URL
      })
    })
  })
})
