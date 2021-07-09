import Knex from 'knex'
import { WorkerUtils, makeWorkerUtils } from 'graphile-worker'

import { AccountService } from './service'
import { createTestApp, TestContainer } from '../tests/app'
import { Account } from './model'
import { resetGraphileDb } from '../tests/graphileDb'
import { GraphileProducer } from '../messaging/graphileProducer'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'
import { truncateTables } from '../tests/tableManager'

describe('Account Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let workerUtils: WorkerUtils
  let accountService: AccountService
  const messageProducer = new GraphileProducer()
  const mockMessageProducer = {
    send: jest.fn()
  }
  const overrideConfig = {
    ...Config,
    databaseUrl: `${process.env.DATABASE_URL}_${process.env.JEST_WORKER_ID}`
  }

  beforeAll(
    async (): Promise<void> => {
      deps = await initIocContainer(overrideConfig)
      deps.bind('messageProducer', async () => mockMessageProducer)
      appContainer = await createTestApp(deps)
      workerUtils = await makeWorkerUtils({
        connectionString: appContainer.connectionUrl
      })
      await workerUtils.migrate()
      messageProducer.setUtils(workerUtils)
      knex = await deps.use('knex')
    }
  )

  beforeEach(
    async (): Promise<void> => {
      accountService = await deps.use('accountService')
    }
  )

  afterAll(
    async (): Promise<void> => {
      await appContainer.shutdown()
      await workerUtils.release()
      await resetGraphileDb(knex)
      await truncateTables(knex)
    }
  )

  describe('Account', (): void => {
    let account: Account

    beforeEach(
      async (): Promise<void> => {
        account = await accountService.create(6, 'USD')
      }
    )

    test('An account can be fetched', async (): Promise<void> => {
      const retrievedAccount = await accountService.get(account.id)
      expect(retrievedAccount.id).toEqual(account.id)
      expect(retrievedAccount.scale).toEqual(account.scale)
      expect(retrievedAccount.currency).toEqual(account.currency)
      expect(retrievedAccount.superAccountId).toBeNull()
    })
  })

  describe('Sub Account', (): void => {
    let account: Account

    beforeEach(
      async (): Promise<void> => {
        account = await accountService.create(6, 'USD')
      }
    )

    test('A sub account can be created and fetched', async (): Promise<void> => {
      const subAccount = await accountService.createSubAccount(account.id)
      const retrievedAccount = await accountService.get(subAccount.id)
      expect(retrievedAccount.id).toEqual(subAccount.id)
      expect(retrievedAccount.scale).toEqual(subAccount.scale)
      expect(retrievedAccount.currency).toEqual(subAccount.currency)
      expect(retrievedAccount.superAccountId).toEqual(subAccount.superAccountId)
    })
  })
})
