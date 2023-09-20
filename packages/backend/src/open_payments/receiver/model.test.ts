import { IocContract } from '@adonisjs/fold'
import { createTestApp, TestContainer } from '../../tests/app'
import { Config } from '../../config/app'
import { initIocContainer } from '../..'
import { AppServices } from '../../app'
import { createIncomingPayment } from '../../tests/incomingPayment'
import { createWalletAddress } from '../../tests/walletAddress'
import { truncateTables } from '../../tests/tableManager'
import { ConnectionService } from '../connection/service'
import { Receiver } from './model'
import { IncomingPaymentState } from '../payment/incoming/model'
import { Connection } from '../connection/model'
import assert from 'assert'

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
      const walletAddress = await createWalletAddress(deps)
      const incomingPayment = await createIncomingPayment(deps, {
        walletAddressId: walletAddress.id
      })

      const connection = connectionService.get(incomingPayment)

      assert(connection instanceof Connection)

      const receiver = Receiver.fromIncomingPayment(
        await incomingPayment.toOpenPaymentsType(walletAddress, connection)
      )

      expect(receiver).toEqual({
        assetCode: incomingPayment.asset.code,
        assetScale: incomingPayment.asset.scale,
        ilpAddress: expect.any(String),
        sharedSecret: expect.any(Buffer),
        incomingPayment: {
          id: incomingPayment.getUrl(walletAddress),
          paymentPointer: walletAddress.url,
          updatedAt: incomingPayment.updatedAt,
          createdAt: incomingPayment.createdAt,
          completed: incomingPayment.completed,
          receivedAmount: incomingPayment.receivedAmount,
          incomingAmount: incomingPayment.incomingAmount,
          expiresAt: incomingPayment.expiresAt
        }
      })
    })

    test('throws if incoming payment is completed', async () => {
      const walletAddress = await createWalletAddress(deps)
      const incomingPayment = await createIncomingPayment(deps, {
        walletAddressId: walletAddress.id
      })

      incomingPayment.state = IncomingPaymentState.Completed
      const connection = connectionService.get(incomingPayment)

      assert(connection instanceof Connection)
      const openPaymentsIncomingPayment =
        await incomingPayment.toOpenPaymentsType(walletAddress, connection)

      expect(() =>
        Receiver.fromIncomingPayment(openPaymentsIncomingPayment)
      ).toThrow('Cannot create receiver from completed incoming payment')
    })

    test('throws if incoming payment is expired', async () => {
      const walletAddress = await createWalletAddress(deps)
      const incomingPayment = await createIncomingPayment(deps, {
        walletAddressId: walletAddress.id
      })

      incomingPayment.expiresAt = new Date(Date.now() - 1)
      const connection = connectionService.get(incomingPayment)

      assert(connection instanceof Connection)
      const openPaymentsIncomingPayment =
        await incomingPayment.toOpenPaymentsType(walletAddress, connection)

      expect(() =>
        Receiver.fromIncomingPayment(openPaymentsIncomingPayment)
      ).toThrow('Cannot create receiver from expired incoming payment')
    })

    test('throws if stream connection has invalid ILP address', async () => {
      const walletAddress = await createWalletAddress(deps)
      const incomingPayment = await createIncomingPayment(deps, {
        walletAddressId: walletAddress.id
      })

      const connection = connectionService.get(incomingPayment)
      assert(connection instanceof Connection)
      ;(connection.ilpAddress as string) = 'not base 64 encoded'

      const openPaymentsIncomingPayment =
        await incomingPayment.toOpenPaymentsType(walletAddress, connection)

      expect(() =>
        Receiver.fromIncomingPayment(openPaymentsIncomingPayment)
      ).toThrow('Invalid ILP address on stream connection')
    })
  })

  describe('fromConnection', () => {
    test('creates receiver', async () => {
      const walletAddress = await createWalletAddress(deps)
      const incomingPayment = await createIncomingPayment(deps, {
        walletAddressId: walletAddress.id
      })

      const connection = connectionService.get(incomingPayment)
      assert(connection instanceof Connection)

      const receiver = Receiver.fromConnection(connection.toOpenPaymentsType())

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
      const walletAddress = await createWalletAddress(deps)
      const incomingPayment = await createIncomingPayment(deps, {
        walletAddressId: walletAddress.id
      })

      const connection = connectionService.get(incomingPayment)
      assert(connection instanceof Connection)

      const openPaymentsConnection = connection.toOpenPaymentsType()

      openPaymentsConnection.ilpAddress = 'not base 64 encoded'

      expect(() => Receiver.fromConnection(openPaymentsConnection)).toThrow(
        'Invalid ILP address on stream connection'
      )
    })
  })
})
