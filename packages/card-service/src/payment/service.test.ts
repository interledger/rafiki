import { createPaymentService } from './service'
import { paymentWaitMap } from './wait-map'
import { PaymentEventResultEnum, PaymentBody } from './types'
import { initIocContainer } from '../index'
import { createTestApp, TestContainer } from '../tests/app'
import { Config } from '../config/app'
import { AppServices } from '../app'
import { IocContract } from '@adonisjs/fold'
import {
  PaymentCreationFailedError,
  PaymentTimeoutError,
  UnknownWalletAddressError
} from './errors'
import { v4 } from 'uuid'
import { GET_WALLET_ADDRESS_BY_URL } from '../graphql/mutations/getWalletAddress'
import { CREATE_OUTGOING_PAYMENT_FROM_INCOMING } from '../graphql/mutations/createOutgoingPayment'

const requestId = '123e4567-e89b-12d3-a456-426614174000'

describe('PaymentService', () => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let service: Awaited<ReturnType<typeof createPaymentService>>
  let querySpy: jest.SpyInstance
  let mutationSpy: jest.SpyInstance

  const paymentFixture: PaymentBody = {
    requestId,
    signature: 'sig',
    payload: 'payload',
    senderWalletAddress: 'https://example.com/wallet/123',
    incomingPaymentUrl: 'https://example.com/incoming-payment/123',
    timestamp: new Date().getTime(),
    amount: {
      assetCode: 'USD',
      assetScale: 2,
      value: '100'
    }
  }

  beforeAll(async () => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    service = await deps.use('paymentService')
  })

  beforeEach(async (): Promise<void> => {
    const apolloClient = await deps.use('apolloClient')
    querySpy = jest.spyOn(apolloClient, 'query')
    querySpy.mockResolvedValue({
      data: {
        walletAddressByUrl: {
          id: v4(),
          asset: {
            code: 'USD',
            scale: 2
          }
        }
      }
    })

    mutationSpy = jest.spyOn(apolloClient, 'mutate')
    mutationSpy.mockResolvedValue({
      data: {
        createOutgoingPaymentFromIncomingPayment: {
          payment: {
            id: v4()
          }
        }
      }
    })
  })

  afterEach(() => {
    paymentWaitMap.clear()
    jest.clearAllMocks()
  })

  afterAll(async () => {
    await appContainer.shutdown()
  })

  describe('create', () => {
    test('resolves when paymentEvent is received', async () => {
      setTimeout(() => {
        const d = paymentWaitMap.get(requestId)
        d?.resolve({
          requestId: requestId,
          outgoingPaymentId: requestId,
          result: { code: PaymentEventResultEnum.Completed }
        })
      }, 10)

      const result = await service.create(paymentFixture)
      expect(result).toEqual({
        requestId: requestId,
        outgoingPaymentId: requestId,
        result: { code: PaymentEventResultEnum.Completed }
      })

      expect(querySpy).toHaveBeenCalledWith({
        query: GET_WALLET_ADDRESS_BY_URL,
        variables: { url: paymentFixture.senderWalletAddress }
      })
      expect(mutationSpy).toHaveBeenCalledWith({
        mutation: CREATE_OUTGOING_PAYMENT_FROM_INCOMING,
        variables: {
          input: {
            walletAddressId: expect.any(String),
            incomingPayment: paymentFixture.incomingPaymentUrl,
            cardDetails: {
              signature: paymentFixture.signature
            }
          }
        }
      })
    })

    test('throws if wallet address is invalid', async (): Promise<void> => {
      querySpy.mockClear()
      querySpy.mockResolvedValue({ data: { walletAddressByUrl: undefined } })
      await expect(service.create(paymentFixture)).rejects.toThrow(
        UnknownWalletAddressError
      )
    })

    test('throws if payment creation failed', async (): Promise<void> => {
      mutationSpy.mockClear()
      mutationSpy.mockResolvedValue(undefined)
      await expect(service.create(paymentFixture)).rejects.toThrow(
        PaymentCreationFailedError
      )
    })

    test('throws PaymentTimeoutError on timeout', async () => {
      const timeoutFixture = {
        ...paymentFixture,
        requestId: '0000-0000-0000-000000000000'
      }
      await expect(service.create(timeoutFixture)).rejects.toThrow(
        PaymentTimeoutError
      )
    })
  })
})
