import assert from 'assert'
import axios from 'axios'
import nock, { Definition } from 'nock'
import { URL } from 'url'
import Knex from 'knex'
import { v4 as uuid } from 'uuid'

import { WebhookEvent } from './model'
import {
  WebhookService,
  generateWebhookSignature,
  RETENTION_LIMIT_MS,
  RETRY_BACKOFF_MS,
  RETRY_LIMIT_MS
} from './service'
import { AccountingService } from '../accounting/service'
import { createTestApp, TestContainer } from '../tests/app'
import { AccountFactory } from '../tests/accountFactory'
import { randomAsset } from '../tests/asset'
import { truncateTables } from '../tests/tableManager'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'

describe('Webhook Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let webhookService: WebhookService
  let accountingService: AccountingService
  let knex: Knex
  let webhookUrl: URL
  let event: WebhookEvent
  const WEBHOOK_SECRET = 'test secret'

  async function makeWithdrawalEvent(event: WebhookEvent): Promise<void> {
    const assetService = await deps.use('assetService')
    const accountFactory = new AccountFactory(accountingService)
    const asset = await assetService.getOrCreate(randomAsset())
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

  beforeAll(
    async (): Promise<void> => {
      Config.webhookSecret = WEBHOOK_SECRET
      deps = await initIocContainer(Config)
      appContainer = await createTestApp(deps)
      knex = await deps.use('knex')
      webhookService = await deps.use('webhookService')
      accountingService = await deps.use('accountingService')
      webhookUrl = new URL(Config.webhookUrl)
    }
  )

  beforeEach(
    async (): Promise<void> => {
      event = await WebhookEvent.query(knex).insertAndFetch({
        id: uuid(),
        type: 'account.test_event',
        data: {
          account: {
            id: uuid()
          }
        },
        processAt: new Date()
      })
    }
  )

  afterEach(
    async (): Promise<void> => {
      jest.useRealTimers()
      await truncateTables(knex)
    }
  )

  afterAll(
    async (): Promise<void> => {
      await appContainer.shutdown()
    }
  )

  describe('Get Webhook Event', (): void => {
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

    test('Creates webhook event withdrawal', async (): Promise<void> => {
      await makeWithdrawalEvent(event)
      assert.ok(event.withdrawal)
      const asset = await WebhookEvent.relatedQuery('withdrawalAsset', knex)
        .for(event.id)
        .first()
      assert.ok(asset)
      const withdrawalSpy = jest.spyOn(accountingService, 'createWithdrawal')
      const scope = mockWebhookServer()
      await expect(webhookService.processNext()).resolves.toEqual(event.id)
      expect(scope.isDone()).toBe(true)
      expect(withdrawalSpy).toHaveBeenCalledWith({
        id: event.id,
        account: {
          id: event.withdrawal.accountId,
          asset
        },
        amount: event.withdrawal.amount,
        timeout: BigInt(RETRY_LIMIT_MS) * BigInt(1e6)
      })
    })

    test('Sends webhook event', async (): Promise<void> => {
      const scope = mockWebhookServer()
      await expect(webhookService.processNext()).resolves.toEqual(event.id)
      expect(scope.isDone()).toBe(true)
      await expect(webhookService.getEvent(event.id)).resolves.toMatchObject({
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
      await expect(webhookService.getEvent(event.id)).resolves.toMatchObject({
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
      await expect(webhookService.getEvent(event.id)).resolves.toBeUndefined()
    })
  })
})
