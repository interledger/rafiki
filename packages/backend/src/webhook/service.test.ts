import assert from 'assert'
import axios from 'axios'
import nock, { Definition } from 'nock'
import { URL } from 'url'
import Knex from 'knex'
import { v4 as uuid } from 'uuid'
import * as Pay from '@interledger/pay'

import { WebhookEvent } from './model'
import {
  WebhookService,
  generateWebhookSignature,
  RETENTION_LIMIT_MS,
  RETRY_BACKOFF_MS,
  RETRY_LIMIT_MS
} from './service'
import { createTestApp, TestContainer } from '../tests/app'
import { randomAsset } from '../tests/asset'
import { truncateTable, truncateTables } from '../tests/tableManager'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'
import { Invoice, InvoiceEventType } from '../open_payments/invoice/model'
import {
  OutgoingPayment,
  PaymentState,
  PaymentEventType,
  isPaymentEventType
} from '../outgoing_payment/model'

export const EventType = { ...InvoiceEventType, ...PaymentEventType }
export type EventType = InvoiceEventType | PaymentEventType

describe('Webhook Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let webhookService: WebhookService
  let knex: Knex
  let invoice: Invoice
  let payment: OutgoingPayment
  let amountReceived: bigint
  let amountSent: bigint
  let balance: bigint
  let webhookUrl: URL
  const WEBHOOK_SECRET = 'test secret'

  beforeAll(
    async (): Promise<void> => {
      Config.webhookSecret = WEBHOOK_SECRET
      deps = await initIocContainer(Config)
      appContainer = await createTestApp(deps)
      knex = await deps.use('knex')
      webhookService = await deps.use('webhookService')
      const accountService = await deps.use('accountService')
      const { id: accountId } = await accountService.create({
        asset: randomAsset()
      })
      const invoiceService = await deps.use('invoiceService')
      invoice = await invoiceService.create({
        accountId,
        amount: BigInt(56),
        expiresAt: new Date(Date.now() + 60 * 1000),
        description: 'description!'
      })
      const outgoingPaymentService = await deps.use('outgoingPaymentService')
      const config = await deps.use('config')
      const invoiceUrl = `${config.publicHost}/invoices/${invoice.id}`
      payment = await outgoingPaymentService.create({
        accountId,
        invoiceUrl,
        autoApprove: false
      })
      await payment.$query(knex).patch({
        state: PaymentState.Funding,
        quote: {
          timestamp: new Date(),
          activationDeadline: new Date(Date.now() + 1000),
          targetType: Pay.PaymentType.FixedSend,
          minDeliveryAmount: BigInt(123),
          maxSourceAmount: BigInt(456),
          maxPacketAmount: BigInt(789),
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          minExchangeRate: Pay.Ratio.from(1.23)!,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          lowExchangeRateEstimate: Pay.Ratio.from(1.2)!,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          highExchangeRateEstimate: Pay.Ratio.from(2.3)!,
          amountSent: BigInt(0)
        }
      })
      amountReceived = BigInt(5)
      amountSent = BigInt(10)
      balance = BigInt(0)
      webhookUrl = new URL(config.webhookUrl)
    }
  )

  afterEach(
    async (): Promise<void> => {
      jest.useRealTimers()
      await truncateTable(knex, WebhookEvent.tableName)
    }
  )

  afterAll(
    async (): Promise<void> => {
      await appContainer.shutdown()
      await truncateTables(knex)
    }
  )

  describe.each(Object.values(EventType).map((type) => [type]))(
    '%s',
    (type): void => {
      let event: WebhookEvent

      beforeEach(
        async (): Promise<void> => {
          event = await WebhookEvent.query(knex).insertAndFetch({
            id: uuid(),
            type,
            data: isPaymentEventType(type)
              ? payment.toData({ amountSent, balance })
              : invoice.toData(amountReceived),
            processAt: new Date()
          })
        }
      )

      describe('Get Webhook Event', (): void => {
        test('A webhook event can be fetched', async (): Promise<void> => {
          await expect(webhookService.getEvent(event.id)).resolves.toEqual(
            event
          )
        })

        test('Cannot fetch a bogus webhook event', async (): Promise<void> => {
          await expect(webhookService.getEvent(uuid())).resolves.toBeUndefined()
        })
      })

      describe('processNext', (): void => {
        function mockWebhookServer(status = 200): nock.Scope {
          return nock(webhookUrl.origin)
            .post(webhookUrl.pathname, function (this: Definition, body) {
              assert.ok(this.headers)
              const signature = this.headers['rafiki-signature']
              expect(
                generateWebhookSignature(
                  body,
                  WEBHOOK_SECRET,
                  Config.signatureVersion
                )
              ).toEqual(signature)
              expect(body.id).toEqual(event.id)
              expect(body.type).toEqual(type)
              if (isPaymentEventType(type)) {
                expect(body.data).toEqual(
                  payment.toData({ amountSent, balance })
                )
              } else {
                expect(body.data).toEqual(invoice.toData(amountReceived))
              }
              return true
            })
            .reply(status)
        }

        test('Does not process events not scheduled to be sent', async (): Promise<void> => {
          await event.$query(knex).patch({
            processAt: new Date(Date.now() + 30_000)
          })
          await expect(webhookService.getEvent(event.id)).resolves.toEqual(
            event
          )
          await expect(webhookService.processNext()).resolves.toBeUndefined()
        })

        test('Sends webhook event', async (): Promise<void> => {
          const scope = mockWebhookServer()
          await expect(webhookService.processNext()).resolves.toEqual(event.id)
          expect(scope.isDone()).toBe(true)
          await expect(
            webhookService.getEvent(event.id)
          ).resolves.toMatchObject({
            attempts: 0,
            error: null,
            processAt: new Date(event.createdAt.getTime() + RETENTION_LIMIT_MS)
          })
        })

        test('Schedules retry if request fails', async (): Promise<void> => {
          const status = 504
          const scope = mockWebhookServer(status)
          await expect(webhookService.processNext()).resolves.toEqual(event.id)
          expect(scope.isDone()).toBe(true)
          const updatedEvent = await webhookService.getEvent(event.id)
          assert.ok(updatedEvent)
          expect(updatedEvent).toMatchObject({
            attempts: 1,
            error: `Request failed with status code ${status}`
          })
          expect(updatedEvent.processAt.getTime()).toBeGreaterThanOrEqual(
            event.createdAt.getTime() + RETRY_BACKOFF_MS
          )
        })

        test('Schedules retry if request times out', async (): Promise<void> => {
          const scope = nock(webhookUrl.origin)
            .post(webhookUrl.pathname)
            .delayConnection(Config.webhookTimeout + 1)
            .reply(200)
          await expect(webhookService.processNext()).resolves.toEqual(event.id)
          expect(scope.isDone()).toBe(true)
          const updatedEvent = await webhookService.getEvent(event.id)
          assert.ok(updatedEvent)
          expect(updatedEvent).toMatchObject({
            attempts: 1,
            error: 'timeout of 2000ms exceeded'
          })
          expect(updatedEvent.processAt.getTime()).toBeGreaterThanOrEqual(
            event.createdAt.getTime() + RETRY_BACKOFF_MS
          )
        })

        test('Stops retrying after limit', async (): Promise<void> => {
          jest.useFakeTimers('modern')
          jest.setSystemTime(
            new Date(event.createdAt.getTime() + RETRY_LIMIT_MS - 1)
          )

          const error = 'last try'
          const mockPost = jest
            .spyOn(axios, 'post')
            .mockRejectedValueOnce(new Error(error))
          await expect(webhookService.processNext()).resolves.toEqual(event.id)
          expect(mockPost).toHaveBeenCalledTimes(1)
          await expect(
            webhookService.getEvent(event.id)
          ).resolves.toMatchObject({
            attempts: 1,
            error,
            processAt: new Date(event.createdAt.getTime() + RETENTION_LIMIT_MS)
          })
        })

        test('Deletes event after retention period', async (): Promise<void> => {
          jest.useFakeTimers('modern')
          jest.setSystemTime(
            new Date(event.createdAt.getTime() + RETENTION_LIMIT_MS)
          )

          await expect(webhookService.processNext()).resolves.toEqual(event.id)
          await expect(
            webhookService.getEvent(event.id)
          ).resolves.toBeUndefined()
        })
      })
    }
  )
})
