import { IocContract } from '@adonisjs/fold'
import { createTestApp, TestContainer } from '../../tests/app'
import { Config, IAppConfig } from '../../config/app'
import { initIocContainer } from '../..'
import { AppServices } from '../../app'
import { createIncomingPayment } from '../../tests/incomingPayment'
import { createWalletAddress } from '../../tests/walletAddress'
import { truncateTables } from '../../tests/tableManager'
import { Receiver } from './model'
import { IncomingPaymentState } from '../payment/incoming/model'

describe('Receiver Model', (): void => {
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
    await truncateTables(deps)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('constructor', () => {
    test('creates receiver', async () => {
      const walletAddress = await createWalletAddress(deps, {
        tenantId: Config.operatorTenantId
      })
      const incomingPayment = await createIncomingPayment(deps, {
        walletAddressId: walletAddress.id,
        tenantId: Config.operatorTenantId
      })
      const isLocal = true

      const receiver = new Receiver(
        incomingPayment.toOpenPaymentsTypeWithMethods(
          config.openPaymentsUrl,
          walletAddress,
          []
        ),
        isLocal
      )

      expect(receiver).toEqual({
        assetCode: incomingPayment.asset.code,
        assetScale: incomingPayment.asset.scale,
        incomingPayment: {
          id: incomingPayment.getUrl(config.openPaymentsUrl),
          walletAddress: walletAddress.address,
          createdAt: incomingPayment.createdAt,
          completed: incomingPayment.completed,
          receivedAmount: incomingPayment.receivedAmount,
          incomingAmount: incomingPayment.incomingAmount,
          expiresAt: incomingPayment.expiresAt,
          methods: []
        },
        isLocal
      })
    })

    test('doesnt throw if incoming payment is completed', async () => {
      const walletAddress = await createWalletAddress(deps, {
        tenantId: Config.operatorTenantId
      })
      const incomingPayment = await createIncomingPayment(deps, {
        walletAddressId: walletAddress.id,
        tenantId: Config.operatorTenantId
      })

      incomingPayment.state = IncomingPaymentState.Completed

      const openPaymentsIncomingPayment =
        incomingPayment.toOpenPaymentsTypeWithMethods(
          config.openPaymentsUrl,
          walletAddress,
          []
        )

      expect(
        () => new Receiver(openPaymentsIncomingPayment, false)
      ).not.toThrow()
    })

    test('doesnt throw if incoming payment is expired', async () => {
      const walletAddress = await createWalletAddress(deps, {
        tenantId: Config.operatorTenantId
      })
      const incomingPayment = await createIncomingPayment(deps, {
        walletAddressId: walletAddress.id,
        tenantId: Config.operatorTenantId
      })

      incomingPayment.expiresAt = new Date(Date.now() - 1)

      const openPaymentsIncomingPayment =
        incomingPayment.toOpenPaymentsTypeWithMethods(
          config.openPaymentsUrl,
          walletAddress,
          []
        )

      expect(
        () => new Receiver(openPaymentsIncomingPayment, false)
      ).not.toThrow()
    })
  })

  describe('isActive', () => {
    test('returns false if incoming payment is completed', async () => {
      const walletAddress = await createWalletAddress(deps)
      const incomingPayment = await createIncomingPayment(deps, {
        walletAddressId: walletAddress.id,
        tenantId: walletAddress.tenantId
      })

      incomingPayment.state = IncomingPaymentState.Completed

      const openPaymentsIncomingPayment =
        incomingPayment.toOpenPaymentsTypeWithMethods(
          config.openPaymentsUrl,
          walletAddress,
          []
        )

      const receiver = new Receiver(openPaymentsIncomingPayment, false)

      expect(receiver.isActive()).toEqual(false)
    })

    test('returns false if incoming payment is expired', async () => {
      const walletAddress = await createWalletAddress(deps)
      const incomingPayment = await createIncomingPayment(deps, {
        walletAddressId: walletAddress.id,
        tenantId: walletAddress.tenantId
      })

      incomingPayment.expiresAt = new Date(Date.now() - 1)
      const openPaymentsIncomingPayment =
        incomingPayment.toOpenPaymentsTypeWithMethods(
          config.openPaymentsUrl,
          walletAddress,
          []
        )

      const receiver = new Receiver(openPaymentsIncomingPayment, false)

      expect(receiver.isActive()).toEqual(false)
    })
  })
})
