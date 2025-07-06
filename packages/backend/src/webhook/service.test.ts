import assert from 'assert'
import { Definition, ReplyHeaderValue, Scope } from 'nock'
import { URL } from 'url'
import { Knex } from 'knex'
import { v4 as uuid } from 'uuid'

import { WebhookEvent } from './event/model'
import { Webhook } from './model'
import {
  WebhookService,
  generateWebhookSignature,
  RETRY_BACKOFF_MS,
  finalizeWebhookRecipients
} from './service'
import { AccountingService } from '../accounting/service'
import { createTestApp, TestContainer } from '../tests/app'
import { AccountFactory } from '../tests/accountFactory'
import { createAsset } from '../tests/asset'
import { truncateTables } from '../tests/tableManager'
import { Config, IAppConfig } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'
import { getPageTests } from '../shared/baseModel.test'
import { Pagination, SortOrder } from '../shared/baseModel'
import { createWebhookEvent, webhookEventTypes } from '../tests/webhook'
import { IncomingPaymentEventType } from '../open_payments/payment/incoming/model'
import { OutgoingPaymentEventType } from '../open_payments/payment/outgoing/model'
import { createIncomingPayment } from '../tests/incomingPayment'
import { createWalletAddress } from '../tests/walletAddress'
import {
  WalletAddress,
  WalletAddressEventType
} from '../open_payments/wallet_address/model'
import { createOutgoingPayment } from '../tests/outgoingPayment'
import { TenantSetting, TenantSettingKeys } from '../tenants/settings/model'
import { faker } from '@faker-js/faker'
import { withConfigOverride } from '../tests/helpers'

const nock = (global as unknown as { nock: typeof import('nock') }).nock

describe('Webhook Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let webhookService: WebhookService
  let accountingService: AccountingService
  let knex: Knex
  let webhookUrl: URL
  let event: WebhookEvent
  let config: IAppConfig
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
    Config.webhookMaxRetry = 10
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    knex = appContainer.knex
    webhookService = await deps.use('webhookService')
    accountingService = await deps.use('accountingService')
    config = await deps.use('config')
    webhookUrl = new URL(Config.webhookUrl)
  })

  afterEach(async (): Promise<void> => {
    jest.useRealTimers()
    await truncateTables(deps)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('Get Webhook Event', (): void => {
    beforeEach(async (): Promise<void> => {
      event = await WebhookEvent.query(knex).insertAndFetch({
        id: uuid(),
        type: WalletAddressEventType.WalletAddressNotFound,
        data: {
          account: {
            id: uuid()
          }
        },
        tenantId: Config.operatorTenantId
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

  describe('Get Webhook Event by account id and types', (): void => {
    let tenantId: string
    let walletAddressIn: WalletAddress
    let walletAddressOut: WalletAddress
    let incomingPaymentIds: string[]
    let outgoingPaymentIds: string[]
    let events: WebhookEvent[] = []

    beforeEach(async (): Promise<void> => {
      tenantId = Config.operatorTenantId
      walletAddressIn = await createWalletAddress(deps, {
        tenantId
      })
      walletAddressOut = await createWalletAddress(deps, {
        tenantId
      })
      incomingPaymentIds = [
        (
          await createIncomingPayment(deps, {
            walletAddressId: walletAddressIn.id,
            tenantId: Config.operatorTenantId
          })
        ).id,
        (
          await createIncomingPayment(deps, {
            walletAddressId: walletAddressIn.id,
            tenantId: Config.operatorTenantId
          })
        ).id
      ]
      outgoingPaymentIds = [
        (
          await createOutgoingPayment(deps, {
            method: 'ilp',
            tenantId,
            walletAddressId: walletAddressOut.id,
            receiver: '',
            validDestination: false
          })
        ).id,
        (
          await createOutgoingPayment(deps, {
            method: 'ilp',
            tenantId,
            walletAddressId: walletAddressOut.id,
            receiver: '',
            validDestination: false
          })
        ).id
      ]

      events = [
        await WebhookEvent.query(knex).insertAndFetch({
          id: uuid(),
          type: IncomingPaymentEventType.IncomingPaymentCompleted,
          data: { id: uuid() },
          incomingPaymentId: incomingPaymentIds[0],
          tenantId: Config.operatorTenantId
        }),
        await WebhookEvent.query(knex).insertAndFetch({
          id: uuid(),
          type: IncomingPaymentEventType.IncomingPaymentExpired,
          data: { id: uuid() },
          incomingPaymentId: incomingPaymentIds[0],
          tenantId: Config.operatorTenantId
        }),
        await WebhookEvent.query(knex).insertAndFetch({
          id: uuid(),
          type: IncomingPaymentEventType.IncomingPaymentCompleted,
          data: { id: uuid() },
          incomingPaymentId: incomingPaymentIds[1],
          tenantId: Config.operatorTenantId
        }),
        await WebhookEvent.query(knex).insertAndFetch({
          id: uuid(),
          type: OutgoingPaymentEventType.PaymentCreated,
          data: { id: uuid() },
          outgoingPaymentId: outgoingPaymentIds[0],
          tenantId: Config.operatorTenantId
        })
      ]
    })

    test('Gets latest event matching account id and type', async (): Promise<void> => {
      await expect(
        webhookService.getLatestByResourceId({
          incomingPaymentId: incomingPaymentIds[0],
          types: [
            IncomingPaymentEventType.IncomingPaymentCompleted,
            IncomingPaymentEventType.IncomingPaymentExpired
          ]
        })
      ).resolves.toEqual(events[1])
      await expect(
        webhookService.getLatestByResourceId({
          outgoingPaymentId: outgoingPaymentIds[0],
          types: [OutgoingPaymentEventType.PaymentCreated]
        })
      ).resolves.toEqual(events[3])
    })

    test('Gets latest of any type when type not provided', async (): Promise<void> => {
      const newLatestEvent = await WebhookEvent.query(knex).insertAndFetch({
        id: uuid(),
        type: 'some_new_type',
        data: { id: uuid() },
        incomingPaymentId: incomingPaymentIds[0],
        tenantId: Config.operatorTenantId
      })
      await expect(
        webhookService.getLatestByResourceId({
          incomingPaymentId: incomingPaymentIds[0]
        })
      ).resolves.toEqual(newLatestEvent)
    })

    describe('Returns undefined if no match', (): void => {
      test('Good account id, bad event type', async (): Promise<void> => {
        await expect(
          webhookService.getLatestByResourceId({
            incomingPaymentId: incomingPaymentIds[0],
            types: ['nonexistant.event']
          })
        ).resolves.toBeUndefined()
      })
      test('Bad account id, good event type', async (): Promise<void> => {
        await expect(
          webhookService.getLatestByResourceId({
            incomingPaymentId: uuid(),
            types: [IncomingPaymentEventType.IncomingPaymentCompleted]
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

    test('can filter by tenantId', async () => {
      await WebhookEvent.query(knex).insertAndFetch({
        id: uuid(),
        type: WalletAddressEventType.WalletAddressNotFound,
        data: {
          account: {
            id: uuid()
          }
        },
        tenantId: Config.operatorTenantId
      })

      await expect(
        webhookService.getPage({ tenantId: Config.operatorTenantId })
      ).resolves.toHaveLength(1)
      await expect(
        webhookService.getPage({ tenantId: crypto.randomUUID() })
      ).resolves.toHaveLength(0)
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
      const type = webhookEventTypes[1]
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
    let webhook: Webhook
    beforeEach(async (): Promise<void> => {
      event = await WebhookEvent.query(knex).insertAndFetch({
        id: uuid(),
        type: WalletAddressEventType.WalletAddressNotFound,
        data: {
          account: {
            id: uuid()
          }
        },
        tenantId: Config.operatorTenantId
      })

      webhook = await Webhook.query(knex)
        .insertAndFetch({
          recipientTenantId: Config.operatorTenantId,
          eventId: event.id
        })
        .withGraphFetched('event')
    })

    function mockWebhookServer(
      status = 200,
      expectedEvent: WebhookEvent = event,
      url?: URL
    ): Scope {
      return nock(url?.origin ?? webhookUrl.origin)
        .post(
          url?.pathname ?? webhookUrl.pathname,
          function (this: Definition, body) {
            expect(body).toMatchObject({
              id: expectedEvent.id,
              type: expectedEvent.type,
              data: expectedEvent.data
            })
            return true
          }
        )
        .reply(status)
    }

    test('Does not process events not scheduled to be sent', async (): Promise<void> => {
      await webhook.$query(knex).patch({
        processAt: new Date(Date.now() + 30_000)
      })
      await expect(webhookService.getEvent(event.id)).resolves.toEqual(event)
      await expect(webhookService.processNext()).resolves.toBeUndefined()
    })

    test.each`
      isTenanted | description
      ${false}   | ${''}
      ${true}    | ${' to tenant URL'}
    `(
      'Sends webhook event$description',
      async ({ isTenanted }): Promise<void> => {
        let setting
        if (isTenanted) {
          setting = await TenantSetting.query(knex).insertAndFetch({
            tenantId: Config.operatorTenantId,
            key: TenantSettingKeys.WEBHOOK_URL.name,
            value: faker.internet.url()
          })
        }
        const scope = mockWebhookServer(
          200,
          event,
          setting ? new URL(setting.value) : undefined
        )
        await expect(webhookService.processNext()).resolves.toEqual(webhook.id)
        scope.done()
        const dbWebhook = await Webhook.query().findById(webhook.id)
        await expect(dbWebhook).toMatchObject(
          expect.objectContaining({
            attempts: 1,
            statusCode: 200,
            processAt: null
          })
        )
      }
    )

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

      await expect(webhookService.processNext()).resolves.toEqual(webhook.id)
      scope.done()
    })

    test.each([[201], [400], [504]])(
      'Schedules retry if request fails (%i)',
      async (status): Promise<void> => {
        const scope = mockWebhookServer(status)
        await expect(webhookService.processNext()).resolves.toEqual(webhook.id)
        scope.done()
        const updatedWebhook = await Webhook.query(knex).findById(webhook.id)
        assert.ok(updatedWebhook?.processAt)
        expect(updatedWebhook).toMatchObject({
          attempts: 1,
          statusCode: status
        })
        expect(updatedWebhook.processAt.getTime()).toBeGreaterThanOrEqual(
          event.createdAt.getTime() + RETRY_BACKOFF_MS
        )
      }
    )

    test.each`
      isTenanted | description
      ${false}   | ${''}
      ${true}    | ${' in tenant settings'}
    `(
      'Schedule retry if request reaches timeout$description',
      async ({ isTenanted }): Promise<void> => {
        let setting
        if (isTenanted) {
          setting = await TenantSetting.query(knex).insertAndFetch({
            tenantId: Config.operatorTenantId,
            key: TenantSettingKeys.WEBHOOK_TIMEOUT.name,
            value: '1000'
          })
        }

        const scope = nock(webhookUrl.origin)
          .post(webhookUrl.pathname)
          .delay(
            setting ? Number(setting.value) + 1 : Config.webhookTimeout + 1
          )
          .reply(200)
        await expect(webhookService.processNext()).resolves.toEqual(webhook.id)
        scope.done()
        const updatedWebhook = await Webhook.query(knex).findById(webhook.id)
        assert.ok(updatedWebhook?.processAt)
        expect(updatedWebhook).toMatchObject({
          attempts: 1,
          statusCode: null
        })
        expect(updatedWebhook.processAt.getTime()).toBeGreaterThanOrEqual(
          event.createdAt.getTime() + RETRY_BACKOFF_MS
        )
      }
    )

    test.each`
      isTenanted | description
      ${false}   | ${''}
      ${true}    | ${' in tenant settings'}
    `(
      'Does not send event if max attempts is reached$description',
      async ({ isTenanted }): Promise<void> => {
        let setting
        if (isTenanted) {
          setting = await TenantSetting.query(knex).insertAndFetch({
            tenantId: Config.operatorTenantId,
            key: TenantSettingKeys.WEBHOOK_MAX_RETRY.name,
            value: '5'
          })
        }
        let requests = 0
        nock(webhookUrl.origin)
          .post('/')
          .reply(200, () => {
            requests++
          })
        await webhook.$query(knex).patch({
          attempts: setting ? Number(setting.value) : Config.webhookMaxRetry
        })
        await expect(webhookService.getEvent(event.id)).resolves.toEqual(event)
        await expect(webhookService.processNext()).resolves.toBeUndefined()
        expect(requests).toBe(0)
      }
    )

    test.each`
      isTenanted | description
      ${false}   | ${''}
      ${true}    | ${' in tenant settings'}
    `(
      'Skips the event if max attempts$description is reached (processes the next one)',
      async ({ isTenanted }): Promise<void> => {
        let setting
        if (isTenanted) {
          setting = await TenantSetting.query(knex).insertAndFetch({
            tenantId: Config.operatorTenantId,
            key: TenantSettingKeys.WEBHOOK_MAX_RETRY.name,
            value: '5'
          })
        }
        await webhook.$query(knex).patch({
          attempts: setting ? Number(setting.value) : Config.webhookMaxRetry
        })

        const nextEvent = await WebhookEvent.query(knex).insertAndFetch({
          id: uuid(),
          type: WalletAddressEventType.WalletAddressNotFound,
          data: {
            account: {
              id: uuid()
            }
          },
          tenantId: Config.operatorTenantId
        })
        const scope = mockWebhookServer(200, nextEvent)

        const nextWebhook = await Webhook.query(knex)
          .insertAndFetch({
            recipientTenantId: Config.operatorTenantId,
            eventId: nextEvent.id
          })
          .withGraphFetched('event')

        await expect(webhookService.getEvent(event.id)).resolves.toEqual(event)
        await expect(webhookService.getEvent(nextEvent.id)).resolves.toEqual(
          nextEvent
        )

        await expect(
          Webhook.query(knex).findById(webhook.id).withGraphFetched('event')
        ).resolves.toEqual(webhook)
        await expect(
          Webhook.query(knex).findById(nextWebhook.id).withGraphFetched('event')
        ).resolves.toEqual(nextWebhook)

        await expect(webhookService.processNext()).resolves.toBe(nextWebhook.id)
        scope.done()
        await expect(
          Webhook.query(knex).findById(nextWebhook.id)
        ).resolves.toMatchObject({
          attempts: 1,
          statusCode: 200,
          processAt: null
        })
      }
    )

    test('Uses tenant webhook url', async (): Promise<void> => {
      const tenantWebhookUrl = faker.internet.url()
      await TenantSetting.query(knex).insertAndFetch({
        tenantId: Config.operatorTenantId,
        key: TenantSettingKeys.WEBHOOK_URL.name,
        value: tenantWebhookUrl
      })

      const scope = mockWebhookServer(200, event, new URL(tenantWebhookUrl))
      await expect(webhookService.processNext()).resolves.toEqual(webhook.id)
      await expect(
        Webhook.query(knex).findById(webhook.id)
      ).resolves.toMatchObject({
        attempts: 1,
        statusCode: 200,
        processAt: null
      })

      scope.done()
    })
  })

  describe('finalizeWebhookRecipients', (): void => {
    test(
      'adds operatorTenant as recipient if sendAllWebhooksToOperator is enabled',
      withConfigOverride(
        () => config,
        { sendTenantWebhooksToOperator: true },
        async (): Promise<void> => {
          const tenantId = crypto.randomUUID()
          expect(finalizeWebhookRecipients([tenantId], Config)).toStrictEqual([
            { recipientTenantId: tenantId },
            { recipientTenantId: Config.operatorTenantId }
          ])
        }
      )
    )

    test(
      'does not adds operatorTenant as recipient if sendAllWebhooksToOperator is disabled',
      withConfigOverride(
        () => config,
        { sendTenantWebhooksToOperator: false },
        async (): Promise<void> => {
          const tenantId = crypto.randomUUID()
          expect(finalizeWebhookRecipients([tenantId], Config)).toStrictEqual([
            { recipientTenantId: tenantId }
          ])
        }
      )
    )

    test('prevents adding duplicate recipients', async (): Promise<void> => {
      const tenantId1 = crypto.randomUUID()
      const tenantId2 = crypto.randomUUID()
      const tenantId3 = crypto.randomUUID()
      expect(
        finalizeWebhookRecipients(
          [tenantId1, tenantId1, tenantId2, tenantId2, tenantId3],
          Config
        )
      ).toStrictEqual([
        { recipientTenantId: tenantId1 },
        { recipientTenantId: tenantId2 },
        { recipientTenantId: tenantId3 }
      ])
    })
  })
})
