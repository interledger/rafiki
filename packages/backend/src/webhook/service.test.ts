import assert from 'assert'
import nock, { Definition } from 'nock'
import { URL } from 'url'
import Knex from 'knex'
import { v4 as uuid } from 'uuid'

import { WebhookEventError, isWebhookEventError } from './errors'
import { WebhookEvent } from './model'
import {
  EventOptions,
  WebhookService,
  generateWebhookSignature
} from './service'
import { createTestApp, TestContainer } from '../tests/app'
import { randomAsset } from '../tests/asset'
import { truncateTables } from '../tests/tableManager'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'
import { Pagination } from '../shared/baseModel'
import { getPageTests } from '../shared/baseModel.test'

describe('Webhook Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let webhookService: WebhookService
  let knex: Knex
  let webhookUrl: URL
  let accountId: string
  let assetId: string
  const WEBHOOK_SECRET = 'test secret'

  beforeAll(
    async (): Promise<void> => {
      Config.signatureSecret = WEBHOOK_SECRET
      deps = await initIocContainer(Config)
      appContainer = await createTestApp(deps)
      knex = await deps.use('knex')
      webhookService = await deps.use('webhookService')
      webhookUrl = new URL(Config.webhookUrl)
    }
  )

  beforeEach(
    async (): Promise<void> => {
      const accountService = await deps.use('accountService')
      const account = await accountService.create({ asset: randomAsset() })
      accountId = account.id
      assetId = account.assetId
    }
  )

  afterEach(
    async (): Promise<void> => {
      await truncateTables(knex)
    }
  )

  afterAll(
    async (): Promise<void> => {
      await appContainer.shutdown()
    }
  )

  describe.each`
    withdrawal | description
    ${false}   | ${''}
    ${true}    | ${'Withdrawal'}
  `('Create $description Webhook Event', ({ withdrawal }): void => {
    let options: EventOptions

    beforeEach((): void => {
      options = {
        type: 'account.test_event',
        data: {
          account: {
            id: accountId
          }
        }
      }

      if (withdrawal) {
        options.withdrawal = {
          accountId,
          assetId,
          amount: BigInt(10)
        }
      }
    })

    function mockWebhookServer(
      options: EventOptions,
      status = 200
    ): nock.Scope {
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
            type: options.type,
            data: options.data
          })
          return true
        })
        .reply(status)
    }

    test('A webhook event can be created and fetched', async (): Promise<void> => {
      const event = await webhookService.createEvent(options)
      assert.ok(!isWebhookEventError(event))
      expect(event).toMatchObject(options)
      await expect(webhookService.getEvent(event.id)).resolves.toEqual(event)
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    test.each<any>([200, 201, 400, 504])(
      'Sends webhook event asynchronously (succeeds regardless of response code: %i)',
      async (status, done: jest.DoneCallback): Promise<void> => {
        const scope = mockWebhookServer(options, status)
        scope.on('replied', function (_req, _interceptor) {
          done()
        })
        await expect(
          webhookService.createEvent(options)
        ).resolves.toMatchObject(options)
      }
    )

    if (withdrawal) {
      test.skip('Cannot create webhook event with unknown withdrawal account', async (): Promise<void> => {
        assert.ok(options.withdrawal)
        options.withdrawal.accountId = uuid()
        await expect(webhookService.createEvent(options)).resolves.toEqual(
          WebhookEventError.InvalidWithdrawalAccount
        )
      })

      test('Cannot create webhook event with unknown withdrawal asset', async (): Promise<void> => {
        assert.ok(options.withdrawal)
        options.withdrawal.assetId = uuid()
        await expect(webhookService.createEvent(options)).resolves.toEqual(
          WebhookEventError.InvalidWithdrawalAsset
        )
      })
    }
  })

  describe('Get Webhook Event', (): void => {
    test('Cannot fetch a bogus webhook event', async (): Promise<void> => {
      await expect(webhookService.getEvent(uuid())).resolves.toBeUndefined()
    })
  })

  describe('getPage', (): void => {
    getPageTests({
      createModel: () =>
        webhookService.createEvent({
          type: 'account.test_event',
          data: {
            account: {
              id: accountId
            }
          }
        }) as Promise<WebhookEvent>,
      getPage: (pagination: Pagination) => webhookService.getPage(pagination)
    })
  })
})
