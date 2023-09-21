import { IocContract } from '@adonisjs/fold'
import { createTestApp, TestContainer } from '../../../tests/app'
import { Config, IAppConfig } from '../../../config/app'
import { initIocContainer } from '../../..'
import { AppServices } from '../../../app'
import { createIncomingPayment } from '../../../tests/incomingPayment'
import { createWalletAddress } from '../../../tests/walletAddress'
import { truncateTables } from '../../../tests/tableManager'
import { Connection } from '../../connection/model'
import { serializeAmount } from '../../amount'
import { IlpAddress } from 'ilp-packet'
import { IncomingPayment } from './model'

describe('Incoming Payment Model', (): void => {
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

  describe('toOpenPaymentsType', () => {
    test('returns incoming payment without connection provided', async () => {
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

    test('returns incoming payment with connection as string', async () => {
      const walletAddress = await createWalletAddress(deps)
      const incomingPayment = await createIncomingPayment(deps, {
        walletAddressId: walletAddress.id,
        metadata: { description: 'my payment' }
      })

      const connection = `${config.openPaymentsUrl}/connections/${incomingPayment.connectionId}`

      expect(
        incomingPayment.toOpenPaymentsType(walletAddress, connection)
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
        ilpStreamConnection: connection
      })
    })

    test('returns incoming payment with connection as object', async () => {
      const walletAddress = await createWalletAddress(deps)
      const incomingPayment = await createIncomingPayment(deps, {
        walletAddressId: walletAddress.id,
        metadata: { description: 'my payment' }
      })

      const connection = Connection.fromPayment({
        payment: incomingPayment,
        openPaymentsUrl: config.openPaymentsUrl,
        credentials: {
          ilpAddress: 'test.ilp' as IlpAddress,
          sharedSecret: Buffer.from('')
        }
      })

      expect(
        incomingPayment.toOpenPaymentsType(walletAddress, connection)
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
        ilpStreamConnection: {
          id: `${config.openPaymentsUrl}/connections/${incomingPayment.connectionId}`,
          ilpAddress: 'test.ilp',
          sharedSecret: expect.any(String),
          assetCode: incomingPayment.asset.code,
          assetScale: incomingPayment.asset.scale
        }
      })
    })
  })
})
