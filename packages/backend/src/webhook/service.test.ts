import assert from 'assert'
import nock, { Definition, ReplyHeaderValue } from 'nock'
import { URL } from 'url'
import { Knex } from 'knex'
import { v4 as uuid } from 'uuid'

import { WebhookEvent } from './model'
import {
  WebhookService,
  generateWebhookSignature,
  RETRY_BACKOFF_MS
} from './service'
import { AccountingService } from '../accounting/service'
import { createTestApp, TestContainer } from '../tests/app'
import { AccountFactory } from '../tests/accountFactory'
import { createAsset } from '../tests/asset'
import { truncateTables } from '../tests/tableManager'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'
import { getPageTests } from '../shared/baseModel.test'
import { Pagination, SortOrder } from '../shared/baseModel'
import {
  createWebhookEvent,
  randomWebhookEvent,
  webhookEventTypes
} from '../tests/webhook'

describe('Webhook Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let webhookService: WebhookService
  let accountingService: AccountingService
  let knex: Knex
  let webhookUrl: URL
  let event: WebhookEvent
  let sortOrder: SortOrder
  const WEBHOOK_SECRET = 'test secret'

  async function makeWithdrawalEvent(event: WebhookEvent): Promise<void> {
    const accountFactory = new AccountFactory(accountingService)
    const asset = await createAsset(deps)
    const amount = BigInt(10)
    const account = await accountFactory.build({
      asset,
      balance: amount
    })
    await event.$query(knex).patch({
      withdrawal: {
        accountId: account.id,
        assetId: account.asset.id,
        amount
      }
    })
  }

  beforeAll(async (): Promise<void> => {
    Config.signatureSecret = WEBHOOK_SECRET
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    knex = appContainer.knex
    webhookService = await deps.use('webhookService')
    accountingService = await deps.use('accountingService')
    webhookUrl = new URL(Config.webhookUrl)
    sortOrder = Math.random() < 0.5 ? SortOrder.Asc : SortOrder.Desc
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('Get Webhook Event', (): void => {
    beforeEach(async (): Promise<void> => {
      event = await WebhookEvent.query(knex).insertAndFetch({
        id: uuid(),
        type: 'account.test_event',
        data: {
          account: {
            id: uuid()
          }
        }
      })
    })

    test('A webhook event can be fetched', async (): Promise<void> => {
      await expect(webhookService.getEvent(event.id)).resolves.toEqual(event)
    })

    test('A withdrawal webhook event can be fetched', async (): Promise<void> => {
      await makeWithdrawalEvent(event)
      assert.ok(event.withdrawal)
      await expect(webhookService.getEvent(event.id)).resolves.toEqual(event)
    })

    test('Cannot fetch a bogus webhook event', async (): Promise<void> => {
      await expect(webhookService.getEvent(uuid())).resolves.toBeUndefined()
    })
  })

  describe('getPage', (): void => {
    getPageTests({
      createModel: () => createWebhookEvent(deps),
      getPage: (pagination?: Pagination, sortOrder?: SortOrder) =>
        webhookService.getPage({ pagination, sortOrder })
    })
  })

  describe('getWebhookEventsPage', (): void => {
    const eventOverrides = [
      { type: webhookEventTypes[0] },
      { type: webhookEventTypes[0] },
      { type: webhookEventTypes[1] },
      { type: webhookEventTypes[1] },
      { type: webhookEventTypes[1] },
      { type: webhookEventTypes[2] }
    ]
    let webhookEvents: WebhookEvent[] = []

    beforeEach(async (): Promise<void> => {
      for (const eventOverride of eventOverrides) {
        webhookEvents.push(
          await createWebhookEvent(deps, randomWebhookEvent(eventOverride))
        )
      }
    })
    afterEach(async (): Promise<void> => {
      webhookEvents = []
    })

    test('No filter gets all', async (): Promise<void> => {
      const webhookEvents = await webhookService.getPage()
      const allWebhookEvents = await WebhookEvent.query(knex)
      expect(webhookEvents.length).toBe(allWebhookEvents.length)
    })

    const uniqueTypes = Array.from(
      new Set(eventOverrides.map((event) => event.type))
    )
    test.each(uniqueTypes)('Filter by type: %s', async (type) => {
      const webhookEvents = await webhookService.getPage({
        filter: {
          type: {
            in: [type]
          }
        },
        sortOrder
      })
      const expectedLength = webhookEvents.filter(
        (event) => event.type === type
      ).length
      expect(webhookEvents.length).toBe(expectedLength)
    })

    test('Can paginate and filter', async (): Promise<void> => {
      const type = webhookEventTypes[1]
      const filter = { type: { in: [type] } }
      const idsOfTypeY = webhookEvents
        .filter((event) => event.type === type)
        .map((event) => event.id)
      if (sortOrder === SortOrder.Desc) {
        idsOfTypeY.reverse()
      }
      const page = await webhookService.getPage({
        pagination: { first: 10, after: idsOfTypeY[0] },
        filter,
        sortOrder
      })
      expect(page[0].id).toBe(idsOfTypeY[1])
      expect(page.filter((event) => event.type === type).length).toBe(
        page.length
      )
    })
  })

  describe.skip('processNext', (): void => {
    function mockWebhookServer(status = 200): nock.Scope {
      return nock(webhookUrl.origin)
        .post(webhookUrl.pathname, function (this: Definition, body) {
          assert.ok(this.headers)
          const headers = this.headers as Record<string, ReplyHeaderValue>
          const signature = headers['rafiki-signature']
          expect(
            generateWebhookSignature(
              body,
              WEBHOOK_SECRET,
              Config.signatureVersion
            )
          ).toEqual(signature)
          expect(body).toMatchObject({
            id: event.id,
            type: event.type,
            data: event.data
          })
          return true
        })
        .reply(status)
    }

    test('Does not process events not scheduled to be sent', async (): Promise<void> => {
      await event.$query(knex).patch({
        processAt: new Date(Date.now() + 30_000)
      })
      await expect(webhookService.getEvent(event.id)).resolves.toEqual(event)
      await expect(webhookService.processNext()).resolves.toBeUndefined()
    })

    test('Sends webhook event', async (): Promise<void> => {
      const scope = mockWebhookServer()
      await expect(webhookService.processNext()).resolves.toEqual(event.id)
      scope.done()
      await expect(webhookService.getEvent(event.id)).resolves.toMatchObject({
        attempts: 1,
        statusCode: 200,
        processAt: null
      })
    })

    test.each([[201], [400], [504]])(
      'Schedules retry if request fails (%i)',
      async (status): Promise<void> => {
        const scope = mockWebhookServer(status)
        await expect(webhookService.processNext()).resolves.toEqual(event.id)
        scope.done()
        const updatedEvent = await webhookService.getEvent(event.id)
        assert.ok(updatedEvent?.processAt)
        expect(updatedEvent).toMatchObject({
          attempts: 1,
          statusCode: status
        })
        expect(updatedEvent.processAt.getTime()).toBeGreaterThanOrEqual(
          event.createdAt.getTime() + RETRY_BACKOFF_MS
        )
      }
    )

    test('Schedules retry if request times out', async (): Promise<void> => {
      const scope = nock(webhookUrl.origin)
        .post(webhookUrl.pathname)
        .delayConnection(Config.webhookTimeout + 1)
        .reply(200)
      await expect(webhookService.processNext()).resolves.toEqual(event.id)
      scope.done()
      const updatedEvent = await webhookService.getEvent(event.id)
      assert.ok(updatedEvent?.processAt)
      expect(updatedEvent).toMatchObject({
        attempts: 1,
        statusCode: null
      })
      expect(updatedEvent.processAt.getTime()).toBeGreaterThanOrEqual(
        event.createdAt.getTime() + RETRY_BACKOFF_MS
      )
    })
  })
})
