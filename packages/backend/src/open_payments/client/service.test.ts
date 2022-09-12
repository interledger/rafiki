import { IocContract } from '@adonisjs/fold'
import { faker } from '@faker-js/faker'
import { Knex } from 'knex'
import nock from 'nock'
import { URL } from 'url'
import { v4 as uuid } from 'uuid'

import { OpenPaymentsClientService } from './service'
import { createTestApp, TestContainer } from '../../tests/app'
import { Config } from '../../config/app'
import { initIocContainer } from '../..'
import { AppServices } from '../../app'
import { createIncomingPayment } from '../../tests/incomingPayment'
import { createPaymentPointer } from '../../tests/paymentPointer'
import { truncateTables } from '../../tests/tableManager'

describe('Open Payments Client Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let clientService: OpenPaymentsClientService
  let knex: Knex

  const CONNECTION_PATH = 'connections'
  const INCOMING_PAYMENT_PATH = 'incoming-payments'

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    clientService = await deps.use('openPaymentsClientService')
    knex = await deps.use('knex')
  })

  afterEach(async (): Promise<void> => {
    jest.useRealTimers()
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })
  describe.each`
    urlPath                  | description
    ${CONNECTION_PATH}       | ${'connection'}
    ${INCOMING_PAYMENT_PATH} | ${'incoming payment'}
  `('receiver.get - $description', ({ urlPath }): void => {
    if (urlPath === CONNECTION_PATH) {
      test('resolves connection from Open Payments server', async (): Promise<void> => {
        const paymentPointer = await createPaymentPointer(deps, {
          mockServerPort: appContainer.openPaymentsPort
        })
        const incomingPayment = await createIncomingPayment(deps, {
          paymentPointerId: paymentPointer.id
        })
        const receiver = await clientService.receiver.get(
          `${Config.openPaymentsUrl}/${urlPath}/${incomingPayment.connectionId}`
        )
        paymentPointer.scope.isDone()
        expect(receiver.assetCode).toEqual(paymentPointer.asset.code)
        expect(receiver.assetScale).toEqual(paymentPointer.asset.scale)
        expect(receiver.incomingAmount).toBeUndefined()
        expect(receiver.receivedAmount).toBeUndefined()
        expect(receiver.ilpAddress).toEqual(expect.any(String))
        expect(receiver.sharedSecret).toEqual(expect.any(Buffer))
      })
    } else {
      test.each`
        incomingAmount | description  | externalRef
        ${undefined}   | ${undefined} | ${undefined}
        ${BigInt(123)} | ${'Test'}    | ${'#123'}
      `(
        'resolves incoming payment from Open Payments server',
        async ({ incomingAmount, description, externalRef }): Promise<void> => {
          const paymentPointer = await createPaymentPointer(deps, {
            mockServerPort: appContainer.openPaymentsPort
          })
          const incomingPayment = await createIncomingPayment(deps, {
            paymentPointerId: paymentPointer.id,
            description,
            incomingAmount: incomingAmount && {
              value: incomingAmount,
              assetCode: paymentPointer.asset.code,
              assetScale: paymentPointer.asset.scale
            },
            externalRef
          })
          const receiver = await clientService.receiver.get(incomingPayment.url)
          paymentPointer.scope.isDone()
          expect(receiver.assetCode).toEqual(paymentPointer.asset.code)
          expect(receiver.assetScale).toEqual(paymentPointer.asset.scale)
          expect(receiver.incomingAmount).toEqual(
            incomingPayment.incomingAmount
          )
          expect(receiver.receivedAmount).toEqual(
            incomingPayment.receivedAmount
          )
          expect(receiver.ilpAddress).toEqual(expect.any(String))
          expect(receiver.sharedSecret).toEqual(expect.any(Buffer))
        }
      )
    }
    test.each`
      statusCode
      ${404}
      ${500}
    `(
      'returns undefined for unsuccessful request ($statusCode)',
      async ({ statusCode }): Promise<void> => {
        const receiverUrl = new URL(
          `${faker.internet.url()}/${urlPath}/${uuid()}`
        )
        const scope = nock(receiverUrl.host)
          .get(receiverUrl.pathname)
          .reply(statusCode)
        scope.isDone()
        await expect(
          clientService.receiver.get(receiverUrl.href)
        ).resolves.toBeUndefined()
      }
    )
    test(`returns undefined for invalid response`, async (): Promise<void> => {
      const receiverUrl = new URL(
        `${faker.internet.url()}/${urlPath}/${uuid()}`
      )
      const scope = nock(receiverUrl.host)
        .get(receiverUrl.pathname)
        .reply(200, () => ({
          validReceiver: 0
        }))
      scope.isDone()
      await expect(
        clientService.receiver.get(receiverUrl.href)
      ).resolves.toBeUndefined()
    })
  })
})
