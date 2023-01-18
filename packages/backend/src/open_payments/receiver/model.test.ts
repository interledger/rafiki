import { IocContract } from '@adonisjs/fold'
import { createTestApp, TestContainer } from '../../tests/app'
import { Config } from '../../config/app'
import { initIocContainer } from '../..'
import { AppServices } from '../../app'
import { createIncomingPayment } from '../../tests/incomingPayment'
import { createPaymentPointer } from '../../tests/paymentPointer'
import { truncateTables } from '../../tests/tableManager'
import { ConnectionService } from '../connection/service'
import { Receiver } from './model'
import { IncomingPaymentState } from '../payment/incoming/model'

describe('Receiver Model', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let connectionService: ConnectionService

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    connectionService = await deps.use('connectionService')
  })

  afterEach(async (): Promise<void> => {
    jest.useRealTimers()
    await truncateTables(appContainer.knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('fromIncomingPayment', () => {
    test('creates receiver', async () => {
      const paymentPointer = await createPaymentPointer(deps)
      const incomingPayment = await createIncomingPayment(deps, {
        paymentPointerId: paymentPointer.id
      })

      const receiver = Receiver.fromIncomingPayment(
        incomingPayment.toOpenPaymentsType({
          ilpStreamConnection: connectionService.get(incomingPayment)
        })
      )

      expect(receiver).toEqual({
        assetCode: incomingPayment.asset.code,
        assetScale: incomingPayment.asset.scale,
        ilpAddress: expect.any(String),
        sharedSecret: expect.any(Buffer),
        incomingPayment: {
          id: incomingPayment.url,
          paymentPointer: incomingPayment.paymentPointer.url,
          updatedAt: incomingPayment.updatedAt,
          createdAt: incomingPayment.createdAt,
          completed: incomingPayment.completed,
          receivedAmount: incomingPayment.receivedAmount,
          incomingAmount: incomingPayment.incomingAmount,
          expiresAt: incomingPayment.expiresAt
        }
      })
    })

    test('fails to create receiver if payment completed', async () => {
      const paymentPointer = await createPaymentPointer(deps)
      const incomingPayment = await createIncomingPayment(deps, {
        paymentPointerId: paymentPointer.id
      })

      incomingPayment.state = IncomingPaymentState.Completed

      const receiver = Receiver.fromIncomingPayment(
        incomingPayment.toOpenPaymentsType({
          ilpStreamConnection: connectionService.get(incomingPayment)
        })
      )

      expect(receiver).toBeUndefined()
    })

    test('fails to create receiver if payment expired', async () => {
      const paymentPointer = await createPaymentPointer(deps)
      const incomingPayment = await createIncomingPayment(deps, {
        paymentPointerId: paymentPointer.id
      })

      incomingPayment.expiresAt = new Date(Date.now() - 1)

      const receiver = Receiver.fromIncomingPayment(
        incomingPayment.toOpenPaymentsType({
          ilpStreamConnection: connectionService.get(incomingPayment)
        })
      )

      expect(receiver).toBeUndefined()
    })
  })

  describe('fromConnection', () => {
    test('creates receiver', async () => {
      const paymentPointer = await createPaymentPointer(deps)
      const incomingPayment = await createIncomingPayment(deps, {
        paymentPointerId: paymentPointer.id
      })

      const receiver = Receiver.fromConnection(
        connectionService.get(incomingPayment).toOpenPaymentsType()
      )

      expect(receiver).toEqual({
        assetCode: incomingPayment.asset.code,
        assetScale: incomingPayment.asset.scale,
        incomingAmountValue: undefined,
        receivedAmountValue: undefined,
        ilpAddress: expect.any(String),
        sharedSecret: expect.any(Buffer),
        expiresAt: undefined
      })
    })

    test('returns undefined if invalid ilpAdress', async () => {
      const paymentPointer = await createPaymentPointer(deps)
      const incomingPayment = await createIncomingPayment(deps, {
        paymentPointerId: paymentPointer.id
      })

      const connection = connectionService
        .get(incomingPayment)
        .toOpenPaymentsType()

      connection.ilpAddress = 'not base 64 encoded'

      expect(Receiver.fromConnection(connection)).toBeUndefined()
    })
  })
})
