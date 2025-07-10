import { IocContract } from '@adonisjs/fold'
import { createTestApp, TestContainer } from '../../../tests/app'
import { Config, IAppConfig } from '../../../config/app'
import { initIocContainer } from '../../..'
import { AppServices } from '../../../app'
import { createIncomingPayment } from '../../../tests/incomingPayment'
import { createWalletAddress } from '../../../tests/walletAddress'
import { truncateTables } from '../../../tests/tableManager'
import { serializeAmount } from '../../amount'
import { IlpAddress } from 'ilp-packet'
import {
  IncomingPayment,
  IncomingPaymentEvent,
  IncomingPaymentEventType,
  IncomingPaymentEventError
} from './model'
import { WalletAddress } from '../../wallet_address/model'
import { OpenPaymentsPaymentMethod } from '../../../payment-method/provider/service'

describe('Models', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let config: IAppConfig

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    config = await deps.use('config')
  })

  afterEach(async (): Promise<void> => {
    jest.useRealTimers()
    await truncateTables(appContainer.knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('Incoming Payment Model', (): void => {
    let walletAddress: WalletAddress
    let baseUrl: string
    let incomingPayment: IncomingPayment

    beforeEach(async (): Promise<void> => {
      walletAddress = await createWalletAddress(deps)
      baseUrl = config.openPaymentsUrl
      incomingPayment = await createIncomingPayment(deps, {
        walletAddressId: walletAddress.id,
        metadata: { description: 'my payment' }
      })
    })

    describe('toOpenPaymentsType', () => {
      test('returns incoming payment', async () => {
        expect(
          incomingPayment.toOpenPaymentsType(
            config.openPaymentsUrl,
            walletAddress
          )
        ).toEqual({
          id: `${baseUrl}${IncomingPayment.urlPath}/${incomingPayment.id}`,
          walletAddress: walletAddress.url,
          completed: incomingPayment.completed,
          receivedAmount: serializeAmount(incomingPayment.receivedAmount),
          incomingAmount: incomingPayment.incomingAmount
            ? serializeAmount(incomingPayment.incomingAmount)
            : undefined,
          expiresAt: incomingPayment.expiresAt.toISOString(),
          metadata: incomingPayment.metadata ?? undefined,
          createdAt: incomingPayment.createdAt.toISOString()
        })
      })
    })

    describe('toOpenPaymentsTypeWithMethods', () => {
      test('returns incoming payment with payment methods', async () => {
        const paymentMethods: OpenPaymentsPaymentMethod[] = [
          {
            type: 'ilp',
            ilpAddress: 'test.ilp' as IlpAddress,
            sharedSecret: ''
          }
        ]

        expect(
          incomingPayment.toOpenPaymentsTypeWithMethods(
            config.openPaymentsUrl,
            walletAddress,
            paymentMethods
          )
        ).toEqual({
          id: `${baseUrl}${IncomingPayment.urlPath}/${incomingPayment.id}`,
          walletAddress: walletAddress.url,
          completed: incomingPayment.completed,
          receivedAmount: serializeAmount(incomingPayment.receivedAmount),
          incomingAmount: incomingPayment.incomingAmount
            ? serializeAmount(incomingPayment.incomingAmount)
            : undefined,
          expiresAt: incomingPayment.expiresAt.toISOString(),
          metadata: incomingPayment.metadata ?? undefined,
          createdAt: incomingPayment.createdAt.toISOString(),
          methods: [
            {
              type: 'ilp',
              ilpAddress: 'test.ilp',
              sharedSecret: expect.any(String)
            }
          ]
        })
      })
    })
  })

  describe('Incoming Payment Event Model', (): void => {
    describe('beforeInsert', (): void => {
      test.each(
        Object.values(IncomingPaymentEventType).map((type) => ({
          type,
          error: IncomingPaymentEventError.IncomingPaymentIdRequired
        }))
      )(
        'Incoming Payment Id is required',
        async ({ type, error }): Promise<void> => {
          expect(
            IncomingPaymentEvent.query().insert({
              type
            })
          ).rejects.toThrow(error)
        }
      )
    })
  })
})
