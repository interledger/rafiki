import assert from 'assert'
import { Definition, ReplyHeaderValue, Scope } from 'nock'
import nock from 'nock'
import { URL } from 'url'
import { Knex } from 'knex'
import { v4 as uuid } from 'uuid'

import { WebhookEvent } from './model'
import {
  WebhookService,
  generateWebhookSignature,
  RETRY_BACKOFF_MS
} from './service'
import { createTestApp, TestContainer } from '../tests/app'
import { truncateTables } from '../tests/tableManager'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'
import { getPageTests } from '../shared/baseModel.test'
import { Pagination, SortOrder } from '../shared/baseModel'
import { createWebhookEvent } from '../tests/webhook'
import { GrantEventType } from '../grant/model'

describe('Webhook Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let webhookService: WebhookService
  let knex: Knex
  let webhookUrl: URL
  let event: WebhookEvent
  const WEBHOOK_SECRET = 'test secret'

  beforeAll(async (): Promise<void> => {
    Config.signatureSecret = WEBHOOK_SECRET
    Config.webhookMaxRetry = 10
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    knex = appContainer.knex
    webhookService = await deps.use('webhookService')
    webhookUrl = new URL(Config.webhookUrl!)
  })

  afterEach(async (): Promise<void> => {
    jest.useRealTimers()
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('Get Webhook Event', (): void => {
    beforeEach(async (): Promise<void> => {
      event = await createWebhookEvent(deps)
    })

    test('A webhook event can be fetched', async (): Promise<void> => {
      await expect(webhookService.getEvent(event.id)).resolves.toEqual(event)
    })

    test('Cannot fetch a bogus webhook event', async (): Promise<void> => {
      await expect(webhookService.getEvent(uuid())).resolves.toBeUndefined()
    })
  })

  describe('Get Webhook Events', (): void => {
    let events: WebhookEvent[] = []

    beforeEach(async (): Promise<void> => {
      events = [
        await createWebhookEvent(deps),
        await createWebhookEvent(deps),
        await createWebhookEvent(deps),
        await createWebhookEvent(deps)
      ]
    })

    test('Gets latest of any type when type not provided', async (): Promise<void> => {
      const newLatestEvent = await createWebhookEvent(deps)
      await expect(
        webhookService.getLatestByResourceId({
          grantId: newLatestEvent.grantId!
        })
      ).resolves.toEqual(newLatestEvent)
    })

    describe('Returns undefined if no match', (): void => {
      test('Good grant id, bad event type', async (): Promise<void> => {
        await expect(
          webhookService.getLatestByResourceId({
            grantId: events[0].grantId!,
            types: ['nonexistant.event']
          })
        ).resolves.toBeUndefined()
      })
      test('Bad grant id, good event type', async (): Promise<void> => {
        await expect(
          webhookService.getLatestByResourceId({
            grantId: uuid(),
            types: [GrantEventType.GrantRevoked]
          })
        ).resolves.toBeUndefined()
      })
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
      { type: 'fake_type' },
      { type: 'fake_type' },
      { type: 'fake_type_2' },
      { type: 'fake_type_2' },
      { type: 'fake_type_2' },
      { type: 'fake_type' }
    ]
    let webhookEvents: WebhookEvent[] = []

    beforeEach(async (): Promise<void> => {
      for (const eventOverride of eventOverrides) {
        webhookEvents.push(await createWebhookEvent(deps, eventOverride))
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
        }
      })
      const expectedLength = webhookEvents.filter(
        (event) => event.type === type
      ).length
      expect(webhookEvents.length).toBe(expectedLength)
    })

    test('Can paginate and filter', async (): Promise<void> => {
      const type = 'fake_type'
      const filter = { type: { in: [type] } }
      const idsOfTypeY = webhookEvents
        .filter((event) => event.type === type)
        .map((event) => event.id)
      idsOfTypeY.reverse() // default is descending
      const page = await webhookService.getPage({
        pagination: { first: 10, after: idsOfTypeY[0] },
        filter
      })
      expect(page[0].id).toBe(idsOfTypeY[1])
      expect(page.filter((event) => event.type === type).length).toBe(
        page.length
      )
    })
  })

  describe('processNext', (): void => {
    beforeEach(async (): Promise<void> => {
      event = await createWebhookEvent(deps)
    })

    function mockWebhookServer(
      status = 200,
      expectedEvent: WebhookEvent = event
    ): Scope {
      return nock(webhookUrl.origin)
        .post(webhookUrl.pathname, function (this: Definition, body) {
          expect(body).toMatchObject({
            id: expectedEvent.id,
            type: expectedEvent.type,
            data: expectedEvent.data
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

    test('Signs webhook event', async (): Promise<void> => {
      jest.useFakeTimers({
        now: Date.now(),
        advanceTimers: true // needed for nock when using fake timers
      })

      const scope = nock(webhookUrl.origin)
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
          return true
        })
        .reply(200)

      await expect(webhookService.processNext()).resolves.toEqual(event.id)
      scope.done()
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

    test('Does not send event if webhookMaxAttempts is reached', async (): Promise<void> => {
      let requests = 0
      nock(webhookUrl.origin)
        .post('/')
        .reply(200, () => {
          requests++
        })
      await event.$query(knex).patch({
        attempts: Config.webhookMaxRetry
      })
      await expect(webhookService.getEvent(event.id)).resolves.toEqual(event)
      await expect(webhookService.processNext()).resolves.toBeUndefined()
      expect(requests).toBe(0)
    })

    test('Skips the event if webhookMaxAttempts is reached (processes the next one)', async (): Promise<void> => {
      await event.$query(knex).patch({
        attempts: Config.webhookMaxRetry
      })

      const nextEvent = await createWebhookEvent(deps)
      const scope = mockWebhookServer(200, nextEvent)

      await expect(webhookService.getEvent(event.id)).resolves.toEqual(event)
      await expect(webhookService.getEvent(nextEvent.id)).resolves.toEqual(
        nextEvent
      )

      await expect(webhookService.processNext()).resolves.toBe(nextEvent.id)
      scope.done()
      await expect(
        webhookService.getEvent(nextEvent.id)
      ).resolves.toMatchObject({
        attempts: 1,
        statusCode: 200,
        processAt: null
      })
    })
  })
})
