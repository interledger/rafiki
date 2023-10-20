import { IocContract } from '@adonisjs/fold'
import { createTestApp, TestContainer } from '../../../tests/app'
import { Config } from '../../../config/app'
import { initIocContainer } from '../../..'
import { AppServices } from '../../../app'
import { createIncomingPayment } from '../../../tests/incomingPayment'
import { createWalletAddress } from '../../../tests/walletAddress'
import { truncateTables } from '../../../tests/tableManager'
import { IlpStreamCredentials } from '../../../payment-method/ilp/stream-credentials/service'
import { serializeAmount } from '../../amount'
import { IlpAddress } from 'ilp-packet'
import { IncomingPayment, IncomingPaymentState } from './model'

describe('Incoming Payment Model', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
  })

  afterEach(async (): Promise<void> => {
    jest.useRealTimers()
    await truncateTables(appContainer.knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('toOpenPaymentsType', () => {
    test('returns incoming payment', async () => {
      const walletAddress = await createWalletAddress(deps)
      const incomingPayment = await createIncomingPayment(deps, {
        walletAddressId: walletAddress.id,
        metadata: { description: 'my payment' }
      })

      expect(incomingPayment.toOpenPaymentsType(walletAddress)).toEqual({
        id: `${walletAddress.url}${IncomingPayment.urlPath}/${incomingPayment.id}`,
        walletAddress: walletAddress.url,
        completed: incomingPayment.completed,
        receivedAmount: serializeAmount(incomingPayment.receivedAmount),
        incomingAmount: incomingPayment.incomingAmount
          ? serializeAmount(incomingPayment.incomingAmount)
          : undefined,
        expiresAt: incomingPayment.expiresAt.toISOString(),
        metadata: incomingPayment.metadata ?? undefined,
        updatedAt: incomingPayment.updatedAt.toISOString(),
        createdAt: incomingPayment.createdAt.toISOString()
      })
    })
  })

  describe('toOpenPaymentsTypeWithMethods', () => {
    test('returns incoming payment with payment methods', async () => {
      const walletAddress = await createWalletAddress(deps)
      const incomingPayment = await createIncomingPayment(deps, {
        walletAddressId: walletAddress.id,
        metadata: { description: 'my payment' }
      })

      const streamCredentials: IlpStreamCredentials = {
        ilpAddress: 'test.ilp' as IlpAddress,
        sharedSecret: Buffer.from('')
      }

      expect(
        incomingPayment.toOpenPaymentsTypeWithMethods(
          walletAddress,
          streamCredentials
        )
      ).toEqual({
        id: `${walletAddress.url}${IncomingPayment.urlPath}/${incomingPayment.id}`,
        walletAddress: walletAddress.url,
        completed: incomingPayment.completed,
        receivedAmount: serializeAmount(incomingPayment.receivedAmount),
        incomingAmount: incomingPayment.incomingAmount
          ? serializeAmount(incomingPayment.incomingAmount)
          : undefined,
        expiresAt: incomingPayment.expiresAt.toISOString(),
        metadata: incomingPayment.metadata ?? undefined,
        updatedAt: incomingPayment.updatedAt.toISOString(),
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

    test.each([IncomingPaymentState.Completed, IncomingPaymentState.Expired])(
      'returns incoming payment with empty methods if payment state is %s',
      async (paymentState): Promise<void> => {
        const walletAddress = await createWalletAddress(deps)
        const incomingPayment = await createIncomingPayment(deps, {
          walletAddressId: walletAddress.id,
          metadata: { description: 'my payment' }
        })
        incomingPayment.state = paymentState

        const streamCredentials: IlpStreamCredentials = {
          ilpAddress: 'test.ilp' as IlpAddress,
          sharedSecret: Buffer.from('')
        }

        expect(
          incomingPayment.toOpenPaymentsTypeWithMethods(
            walletAddress,
            streamCredentials
          )
        ).toEqual({
          id: `${walletAddress.url}${IncomingPayment.urlPath}/${incomingPayment.id}`,
          walletAddress: walletAddress.url,
          completed: incomingPayment.completed,
          receivedAmount: serializeAmount(incomingPayment.receivedAmount),
          incomingAmount: incomingPayment.incomingAmount
            ? serializeAmount(incomingPayment.incomingAmount)
            : undefined,
          expiresAt: incomingPayment.expiresAt.toISOString(),
          metadata: incomingPayment.metadata ?? undefined,
          updatedAt: incomingPayment.updatedAt.toISOString(),
          createdAt: incomingPayment.createdAt.toISOString(),
          methods: []
        })
      }
    )
  })
})
