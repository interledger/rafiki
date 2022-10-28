import { IocContract } from '@adonisjs/fold'
import { faker } from '@faker-js/faker'
import axios from 'axios'
import { Knex } from 'knex'
import nock from 'nock'
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

describe('Receiver Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let receiverService: ReceiverService
  let knex: Knex

  const CONNECTION_PATH = 'connections'
  const INCOMING_PAYMENT_PATH = 'incoming-payments'

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    receiverService = await deps.use('receiverService')
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
    local    | description
    ${true}  | ${'local'}
    ${false} | ${'remote'}
  `('get - $description', ({ local }): void => {
    describe.each`
      urlPath                  | description
      ${CONNECTION_PATH}       | ${'connection'}
      ${INCOMING_PAYMENT_PATH} | ${'incoming payment'}
    `('$description', ({ urlPath }): void => {
      if (urlPath === CONNECTION_PATH) {
        test('resolves connection from Open Payments server', async (): Promise<void> => {
          const paymentPointer = await createPaymentPointer(deps)
          const { connectionId } = await createIncomingPayment(deps, {
            paymentPointerId: paymentPointer.id
          })
          const localUrl = `${Config.openPaymentsUrl}/${urlPath}/${connectionId}`
          const remoteUrl = new URL(
            `${faker.internet.url()}/${urlPath}/${connectionId}`
          )
          const scope = nock(remoteUrl.origin)
            .get(remoteUrl.pathname)
            .reply(200, function () {
              return axios
                .get(localUrl, {
                  headers: this.req.headers
                })
                .then((res) => res.data)
            })

          await expect(
            receiverService.get(local ? localUrl : remoteUrl.href)
          ).resolves.toMatchObject({
            assetCode: paymentPointer.asset.code,
            assetScale: paymentPointer.asset.scale,
            incomingAmount: undefined,
            receivedAmount: undefined,
            ilpAddress: expect.any(String),
            sharedSecret: expect.any(Buffer)
          })
          expect(local).not.toEqual(scope.isDone())
        })
        if (local) {
          test('returns undefined for unknown connection', async (): Promise<void> => {
            await expect(
              receiverService.get(
                `${Config.openPaymentsUrl}/${urlPath}/${uuid()}`
              )
            ).resolves.toBeUndefined()
          })
        }
      } else {
        test.each`
          incomingAmount | description  | externalRef
          ${undefined}   | ${undefined} | ${undefined}
          ${BigInt(123)} | ${'Test'}    | ${'#123'}
        `(
          'resolves incoming payment from Open Payments server',
          async ({
            incomingAmount,
            description,
            externalRef
          }): Promise<void> => {
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
            let spy: jest.SpyInstance
            if (!local) {
              const paymentPointerService = await deps.use(
                'paymentPointerService'
              )
              spy = jest
                .spyOn(paymentPointerService, 'getByUrl')
                .mockResolvedValueOnce(undefined)
            }
            const receiver = await receiverService.get(incomingPayment.url)
            if (!local) {
              expect(spy).toHaveBeenCalledWith(paymentPointer.url)
            }
            expect(local).not.toEqual(paymentPointer.scope.isDone())
            expect(receiver).toMatchObject({
              assetCode: paymentPointer.asset.code,
              assetScale: paymentPointer.asset.scale,
              incomingAmount: incomingPayment.incomingAmount,
              receivedAmount: incomingPayment.receivedAmount,
              ilpAddress: expect.any(String),
              sharedSecret: expect.any(Buffer)
            })
          }
        )
        if (local) {
          test('returns undefined for unknown incoming payment', async (): Promise<void> => {
            const paymentPointer = await createPaymentPointer(deps)
            await expect(
              receiverService.get(`${paymentPointer.url}/${urlPath}/${uuid()}`)
            ).resolves.toBeUndefined()
          })
        }
      }
      if (!local) {
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
            const scope = nock(receiverUrl.origin)
              .get(receiverUrl.pathname)
              .reply(statusCode)
            await expect(
              receiverService.get(receiverUrl.href)
            ).resolves.toBeUndefined()
            scope.done()
          }
        )
        test(`returns undefined for invalid response`, async (): Promise<void> => {
          const receiverUrl = new URL(
            `${faker.internet.url()}/${urlPath}/${uuid()}`
          )
          const scope = nock(receiverUrl.origin)
            .get(receiverUrl.pathname)
            .reply(200, () => ({
              validReceiver: 0
            }))
          await expect(
            receiverService.get(receiverUrl.href)
          ).resolves.toBeUndefined()
          scope.done()
        })
      }
    })
  })
})
