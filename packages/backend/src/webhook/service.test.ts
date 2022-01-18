import assert from 'assert'
import nock, { Definition } from 'nock'
import { URL } from 'url'
import Knex from 'knex'
import { v4 as uuid } from 'uuid'

import {
  EventType,
  isPaymentEventType,
  WebhookService,
  generateWebhookSignature,
  invoiceToData,
  paymentToData
} from './service'
import { createTestApp, TestContainer } from '../tests/app'
import { randomAsset } from '../tests/asset'
import { truncateTables } from '../tests/tableManager'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'
import { Invoice } from '../open_payments/invoice/model'
import { OutgoingPayment } from '../outgoing_payment/model'

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
      amountReceived = BigInt(5)
      amountSent = BigInt(10)
      balance = BigInt(0)
      webhookUrl = new URL(config.webhookUrl)
    }
  )

  afterAll(
    async (): Promise<void> => {
      await appContainer.shutdown()
      await truncateTables(knex)
    }
  )

  describe('Send Event', (): void => {
    it.each(Object.values(EventType).map((type) => [type]))(
      '%s',
      async (type): Promise<void> => {
        const id = uuid()
        nock(webhookUrl.origin)
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
            expect(body.id).toEqual(id)
            expect(body.type).toEqual(type)
            if (isPaymentEventType(type)) {
              expect(body.data).toEqual(
                paymentToData(payment, amountSent, balance)
              )
            } else {
              expect(body.data).toEqual(invoiceToData(invoice, amountReceived))
            }
            return true
          })
          .reply(200)

        if (isPaymentEventType(type)) {
          await webhookService.send({
            id,
            type,
            payment,
            amountSent,
            balance
          })
        } else {
          await webhookService.send({
            id,
            type,
            invoice,
            amountReceived
          })
        }
      }
    )

    it('throws for failed request', async (): Promise<void> => {
      const scope = nock(webhookUrl.origin).post(webhookUrl.pathname).reply(500)

      await expect(
        webhookService.send({
          id: uuid(),
          type: EventType.InvoicePaid,
          invoice,
          amountReceived
        })
      ).rejects.toThrowError('Request failed with status code 500')

      expect(scope.isDone()).toBe(true)
    })
  })
})
