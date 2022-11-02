import { IocContract } from '@adonisjs/fold'
import { Knex } from 'knex'
import { URL } from 'url'
import { v4 as uuid } from 'uuid'

import { ReceiverService } from './service'
import { createTestApp, TestContainer } from '../../tests/app'
import { Config } from '../../config/app'
import { initIocContainer } from '../..'
import { AppServices } from '../../app'
import { createIncomingPayment } from '../../tests/incomingPayment'
import { createPaymentPointer } from '../../tests/paymentPointer'
import { truncateTables } from '../../tests/tableManager'
import { ConnectionService } from '../connection/service'
import { OpenPaymentsClient } from 'open-payments'
import { PaymentPointerService } from '../payment_pointer/service'

describe('Receiver Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let receiverService: ReceiverService
  let openPaymentsClient: OpenPaymentsClient
  let knex: Knex
  let connectionService: ConnectionService
  let paymentPointerService: PaymentPointerService

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    receiverService = await deps.use('receiverService')
    openPaymentsClient = await deps.use('openPaymentsClient')
    connectionService = await deps.use('connectionService')
    paymentPointerService = await deps.use('paymentPointerService')
    knex = await deps.use('knex')
  })

  afterEach(async (): Promise<void> => {
    jest.useRealTimers()
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('get', () => {
    describe('connections', () => {
      const CONNECTION_PATH = 'connections'

      test('resolves local connection', async () => {
        const paymentPointer = await createPaymentPointer(deps, {
          mockServerPort: Config.openPaymentsPort
        })
        const { connectionId } = await createIncomingPayment(deps, {
          paymentPointerId: paymentPointer.id
        })

        const localUrl = `${Config.openPaymentsUrl}/${CONNECTION_PATH}/${connectionId}`

        await expect(receiverService.get(localUrl)).resolves.toMatchObject({
          assetCode: paymentPointer.asset.code,
          assetScale: paymentPointer.asset.scale,
          incomingAmount: undefined,
          receivedAmount: undefined,
          ilpAddress: expect.any(String),
          sharedSecret: expect.any(Buffer)
        })
      })

      test('resolves remote connection', async () => {
        const paymentPointer = await createPaymentPointer(deps)
        const incomingPayment = await createIncomingPayment(deps, {
          paymentPointerId: paymentPointer.id
        })

        const remoteUrl = new URL(
          `${paymentPointer.url}/${CONNECTION_PATH}/${incomingPayment.connectionId}`
        )

        const clientGetConnectionSpy = jest
          .spyOn(openPaymentsClient.ilpStreamConnection, 'get')
          .mockImplementationOnce(async () =>
            connectionService.get(incomingPayment).toOpenPaymentsType()
          )

        await expect(
          receiverService.get(remoteUrl.href)
        ).resolves.toMatchObject({
          assetCode: paymentPointer.asset.code,
          assetScale: paymentPointer.asset.scale,
          incomingAmount: undefined,
          receivedAmount: undefined,
          ilpAddress: expect.any(String),
          sharedSecret: expect.any(Buffer)
        })
        expect(clientGetConnectionSpy).toHaveBeenCalledWith({
          url: remoteUrl.href
        })
      })

      test('returns undefined for unknown connection', async (): Promise<void> => {
        const paymentPointer = await createPaymentPointer(deps)

        await expect(
          receiverService.get(
            `${paymentPointer.url}/${CONNECTION_PATH}/${uuid()}`
          )
        ).resolves.toBeUndefined()
      })
    })

    describe('incoming payments', () => {
      const INCOMING_PAYMENT_PATH = 'incoming-payments'

      test('resolves local incoming payment', async () => {
        const paymentPointer = await createPaymentPointer(deps, {
          mockServerPort: Config.openPaymentsPort
        })
        const incomingPayment = await createIncomingPayment(deps, {
          paymentPointerId: paymentPointer.id,
          incomingAmount: {
            value: BigInt(5),
            assetCode: paymentPointer.asset.code,
            assetScale: paymentPointer.asset.scale
          }
        })

        await expect(
          receiverService.get(incomingPayment.url)
        ).resolves.toMatchObject({
          assetCode: paymentPointer.asset.code,
          assetScale: paymentPointer.asset.scale,
          incomingAmount: incomingPayment.incomingAmount,
          receivedAmount: incomingPayment.receivedAmount,
          ilpAddress: expect.any(String),
          sharedSecret: expect.any(Buffer)
        })
      })

      test('resolves remote incoming payment', async () => {
        const paymentPointer = await createPaymentPointer(deps)
        const incomingPayment = await createIncomingPayment(deps, {
          paymentPointerId: paymentPointer.id,
          incomingAmount: {
            value: BigInt(5),
            assetCode: paymentPointer.asset.code,
            assetScale: paymentPointer.asset.scale
          }
        })

        const clientGetIncomingPaymentSpy = jest
          .spyOn(openPaymentsClient.incomingPayment, 'get')
          .mockImplementationOnce(async () =>
            incomingPayment.toOpenPaymentsType({
              ilpStreamConnection: connectionService.get(incomingPayment)
            })
          )

        jest
          .spyOn(paymentPointerService, 'getByUrl')
          .mockResolvedValueOnce(undefined)

        await expect(
          receiverService.get(incomingPayment.url)
        ).resolves.toMatchObject({
          assetCode: paymentPointer.asset.code,
          assetScale: paymentPointer.asset.scale,
          incomingAmount: incomingPayment.incomingAmount,
          receivedAmount: incomingPayment.receivedAmount,
          ilpAddress: expect.any(String),
          sharedSecret: expect.any(Buffer)
        })
        expect(clientGetIncomingPaymentSpy).toHaveBeenCalledWith({
          url: incomingPayment.url,
          accessToken: expect.any(String)
        })
      })

      test('returns undefined for unknown incoming payment', async (): Promise<void> => {
        const paymentPointer = await createPaymentPointer(deps, {
          mockServerPort: Config.openPaymentsPort
        })

        await expect(
          receiverService.get(
            `${paymentPointer.url}/${INCOMING_PAYMENT_PATH}/${uuid()}`
          )
        ).resolves.toBeUndefined()
      })

      test('returns undefined when fetching remote incoming payment throws', async (): Promise<void> => {
        const paymentPointer = await createPaymentPointer(deps)
        const incomingPayment = await createIncomingPayment(deps, {
          paymentPointerId: paymentPointer.id
        })

        const clientGetIncomingPaymentSpy = jest
          .spyOn(openPaymentsClient.incomingPayment, 'get')
          .mockImplementationOnce(async () => {
            throw new Error('Could not get incoming payment')
          })

        jest
          .spyOn(paymentPointerService, 'getByUrl')
          .mockResolvedValueOnce(undefined)

        await expect(
          receiverService.get(incomingPayment.url)
        ).resolves.toBeUndefined()
        expect(clientGetIncomingPaymentSpy).toHaveBeenCalledWith({
          url: incomingPayment.url,
          accessToken: expect.any(String)
        })
      })
    })
  })
})
