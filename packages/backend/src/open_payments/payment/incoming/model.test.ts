import { IocContract } from '@adonisjs/fold'
import { createTestApp, TestContainer } from '../../../tests/app'
import { Config, IAppConfig } from '../../../config/app'
import { initIocContainer } from '../../..'
import { AppServices } from '../../../app'
import { createIncomingPayment } from '../../../tests/incomingPayment'
import { createPaymentPointer } from '../../../tests/paymentPointer'
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
      const paymentPointer = await createPaymentPointer(deps)
      const incomingPayment = await createIncomingPayment(deps, {
        paymentPointerId: paymentPointer.id,
        description: 'my payment'
      })

      expect(incomingPayment.toOpenPaymentsType(paymentPointer)).toEqual({
        id: `${paymentPointer.url}${IncomingPayment.urlPath}/${incomingPayment.id}`,
        paymentPointer: paymentPointer.url,
        completed: incomingPayment.completed,
        receivedAmount: serializeAmount(incomingPayment.receivedAmount),
        incomingAmount: incomingPayment.incomingAmount
          ? serializeAmount(incomingPayment.incomingAmount)
          : undefined,
        expiresAt: incomingPayment.expiresAt,
        description: incomingPayment.description ?? undefined,
        externalRef: incomingPayment.externalRef ?? undefined,
        updatedAt: incomingPayment.updatedAt.toISOString(),
        createdAt: incomingPayment.createdAt.toISOString()
      })
    })

    test('returns incoming payment with connection as string', async () => {
      const paymentPointer = await createPaymentPointer(deps)
      const incomingPayment = await createIncomingPayment(deps, {
        paymentPointerId: paymentPointer.id,
        description: 'my payment'
      })

      const connection = `${config.openPaymentsUrl}/connections/${incomingPayment.connectionId}`

      expect(
        incomingPayment.toOpenPaymentsType(paymentPointer, connection)
      ).toEqual({
        id: `${paymentPointer.url}${IncomingPayment.urlPath}/${incomingPayment.id}`,
        paymentPointer: paymentPointer.url,
        completed: incomingPayment.completed,
        receivedAmount: serializeAmount(incomingPayment.receivedAmount),
        incomingAmount: incomingPayment.incomingAmount
          ? serializeAmount(incomingPayment.incomingAmount)
          : undefined,
        expiresAt: incomingPayment.expiresAt,
        description: incomingPayment.description ?? undefined,
        externalRef: incomingPayment.externalRef ?? undefined,
        updatedAt: incomingPayment.updatedAt.toISOString(),
        createdAt: incomingPayment.createdAt.toISOString(),
        ilpStreamConnection: connection
      })
    })

    test('returns incoming payment with connection as object', async () => {
      const paymentPointer = await createPaymentPointer(deps)
      const incomingPayment = await createIncomingPayment(deps, {
        paymentPointerId: paymentPointer.id,
        description: 'my payment'
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
        incomingPayment.toOpenPaymentsType(paymentPointer, connection)
      ).toEqual({
        id: `${paymentPointer.url}${IncomingPayment.urlPath}/${incomingPayment.id}`,
        paymentPointer: paymentPointer.url,
        completed: incomingPayment.completed,
        receivedAmount: serializeAmount(incomingPayment.receivedAmount),
        incomingAmount: incomingPayment.incomingAmount
          ? serializeAmount(incomingPayment.incomingAmount)
          : undefined,
        expiresAt: incomingPayment.expiresAt.toISOString(),
        description: incomingPayment.description ?? undefined,
        externalRef: incomingPayment.externalRef ?? undefined,
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
