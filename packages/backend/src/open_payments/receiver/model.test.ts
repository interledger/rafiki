import { IocContract } from '@adonisjs/fold'
import { createTestApp, TestContainer } from '../../tests/app'
import { Config } from '../../config/app'
import { initIocContainer } from '../..'
import { AppServices } from '../../app'
import { createIncomingPayment } from '../../tests/incomingPayment'
import { createWalletAddress } from '../../tests/walletAddress'
import { truncateTables } from '../../tests/tableManager'
import {
  IlpStreamCredentials,
  StreamCredentialsService
} from '../../payment-method/ilp/stream-credentials/service'
import { Receiver } from './model'
import { IncomingPaymentState } from '../payment/incoming/model'
import assert from 'assert'
import base64url from 'base64url'
import { IlpAddress } from 'ilp-packet'
import { IncomingPaymentService } from '../payment/incoming/service'

describe('Receiver Model', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let streamCredentialsService: StreamCredentialsService
  let incomingPaymentService: IncomingPaymentService

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    streamCredentialsService = await deps.use('streamCredentialsService')
    incomingPaymentService = await deps.use('incomingPaymentService')
  })

  afterEach(async (): Promise<void> => {
    jest.useRealTimers()
    await truncateTables(appContainer.knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('constructor', () => {
    test('creates receiver', async () => {
      const walletAddress = await createWalletAddress(deps)
      const incomingPayment = await createIncomingPayment(deps, {
        walletAddressId: walletAddress.id
      })
      const isLocal = true

      const streamCredentials = streamCredentialsService.get(incomingPayment)
      assert(streamCredentials)

      const receiver = new Receiver(
        incomingPaymentService.toOpenPaymentsTypeWithMethods(
          incomingPayment,
          walletAddress,
          streamCredentials
        ),
        isLocal
      )

      expect(receiver).toEqual({
        assetCode: incomingPayment.asset.code,
        assetScale: incomingPayment.asset.scale,
        ilpAddress: expect.any(String),
        sharedSecret: expect.any(Buffer),
        incomingPayment: {
          id: incomingPaymentService.getOpenPaymentsUrl(incomingPayment),
          walletAddress: walletAddress.url,
          updatedAt: incomingPayment.updatedAt,
          createdAt: incomingPayment.createdAt,
          completed: incomingPayment.completed,
          receivedAmount: incomingPayment.receivedAmount,
          incomingAmount: incomingPayment.incomingAmount,
          expiresAt: incomingPayment.expiresAt,
          methods: [
            {
              type: 'ilp',
              ilpAddress: streamCredentials.ilpAddress,
              sharedSecret: base64url(streamCredentials.sharedSecret)
            }
          ]
        },
        isLocal
      })
    })

    test('doesnt throw if incoming payment is completed', async () => {
      const walletAddress = await createWalletAddress(deps)
      const incomingPayment = await createIncomingPayment(deps, {
        walletAddressId: walletAddress.id
      })

      incomingPayment.state = IncomingPaymentState.Completed
      const streamCredentials: IlpStreamCredentials = {
        ilpAddress: 'test.ilp' as IlpAddress,
        sharedSecret: Buffer.from('')
      }

      const openPaymentsIncomingPayment =
        incomingPaymentService.toOpenPaymentsTypeWithMethods(
          incomingPayment,
          walletAddress,
          streamCredentials
        )

      expect(
        () => new Receiver(openPaymentsIncomingPayment, false)
      ).not.toThrow()
    })

    test('doesnt throw if incoming payment is expired', async () => {
      const walletAddress = await createWalletAddress(deps)
      const incomingPayment = await createIncomingPayment(deps, {
        walletAddressId: walletAddress.id
      })

      incomingPayment.expiresAt = new Date(Date.now() - 1)
      const streamCredentials = streamCredentialsService.get(incomingPayment)
      assert(streamCredentials)
      const openPaymentsIncomingPayment =
        incomingPaymentService.toOpenPaymentsTypeWithMethods(
          incomingPayment,
          walletAddress,
          streamCredentials
        )

      expect(
        () => new Receiver(openPaymentsIncomingPayment, false)
      ).not.toThrow()
    })

    test('throws if stream credentials has invalid ILP address', async () => {
      const walletAddress = await createWalletAddress(deps)
      const incomingPayment = await createIncomingPayment(deps, {
        walletAddressId: walletAddress.id
      })

      const streamCredentials = streamCredentialsService.get(incomingPayment)
      assert(streamCredentials)
      ;(streamCredentials.ilpAddress as string) = 'not base 64 encoded'

      const openPaymentsIncomingPayment =
        incomingPaymentService.toOpenPaymentsTypeWithMethods(
          incomingPayment,
          walletAddress,
          streamCredentials
        )

      expect(() => new Receiver(openPaymentsIncomingPayment, false)).toThrow(
        'Invalid ILP address on ilp payment method'
      )
    })
  })

  describe('isActive', () => {
    test('returns false if incoming payment is completed', async () => {
      const walletAddress = await createWalletAddress(deps)
      const incomingPayment = await createIncomingPayment(deps, {
        walletAddressId: walletAddress.id
      })

      incomingPayment.state = IncomingPaymentState.Completed
      const streamCredentials: IlpStreamCredentials = {
        ilpAddress: 'test.ilp' as IlpAddress,
        sharedSecret: Buffer.from('')
      }

      const openPaymentsIncomingPayment =
        incomingPaymentService.toOpenPaymentsTypeWithMethods(
          incomingPayment,
          walletAddress,
          streamCredentials
        )

      const receiver = new Receiver(openPaymentsIncomingPayment, false)

      expect(receiver.isActive()).toEqual(false)
    })

    test('returns false if incoming payment is expired', async () => {
      const walletAddress = await createWalletAddress(deps)
      const incomingPayment = await createIncomingPayment(deps, {
        walletAddressId: walletAddress.id
      })

      incomingPayment.expiresAt = new Date(Date.now() - 1)
      const streamCredentials = streamCredentialsService.get(incomingPayment)
      assert(streamCredentials)
      const openPaymentsIncomingPayment =
        incomingPaymentService.toOpenPaymentsTypeWithMethods(
          incomingPayment,
          walletAddress,
          streamCredentials
        )

      const receiver = new Receiver(openPaymentsIncomingPayment, false)

      expect(receiver.isActive()).toEqual(false)
    })
  })
})
