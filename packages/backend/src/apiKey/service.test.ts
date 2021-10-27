import Knex from 'knex'
import { WorkerUtils, makeWorkerUtils } from 'graphile-worker'
import { ApiKeyService } from './service'
import { createTestApp, TestContainer } from '../tests/app'
import { GraphileProducer } from '../messaging/graphileProducer'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'
import { resetGraphileDb } from '../tests/graphileDb'
import { truncateTables } from '../tests/tableManager'
import { AccountService } from '../account/service'
import { AccountFactory } from '../tests/accountFactory'
import { Account } from '../account/model'
import bcrypt from 'bcrypt'
import { NoExistingApiKeyError, UnknownApiKeyError } from './errors'

describe('Api Key Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let workerUtils: WorkerUtils
  let apiKeyService: ApiKeyService
  let accountService: AccountService
  let accountFactory: AccountFactory
  let account: Account
  let knex: Knex
  const messageProducer = new GraphileProducer()
  const mockMessageProducer = {
    send: jest.fn()
  }

  beforeAll(
    async (): Promise<void> => {
      deps = await initIocContainer(Config)
      deps.bind('messageProducer', async () => mockMessageProducer)
      appContainer = await createTestApp(deps)
      workerUtils = await makeWorkerUtils({
        connectionString: appContainer.connectionUrl
      })
      await workerUtils.migrate()
      messageProducer.setUtils(workerUtils)
      knex = await deps.use('knex')
      apiKeyService = await deps.use('apiKeyService')
      accountService = await deps.use('accountService')
      accountFactory = new AccountFactory(accountService)
    }
  )

  beforeEach(
    async (): Promise<void> => {
      account = await accountFactory.build()
    }
  )

  afterEach(
    async (): Promise<void> => {
      await truncateTables(knex)
    }
  )

  afterAll(
    async (): Promise<void> => {
      await resetGraphileDb(knex)
      await appContainer.shutdown()
      await workerUtils.release()
    }
  )

  describe('Create / Get Api Key', (): void => {
    test('An api key can be created/fetched for a certain account', async (): Promise<void> => {
      const apiKey = await apiKeyService.create(account.id)
      expect(apiKey.key).toBeDefined()
      expect(apiKey.hashedKey).toBeDefined()
      expect(apiKey.accountId).toBeDefined()
      expect(apiKey.createdAt).toBeDefined()
      expect(apiKey.updatedAt).toBeDefined()
      const match = await bcrypt.compare(apiKey.key, apiKey.hashedKey)
      expect(match).toBe(true)

      const fetchedKeys = await apiKeyService.get(account.id)
      expect(fetchedKeys.length).toEqual(1)
      expect(fetchedKeys[0].hashedKey).toEqual(apiKey.hashedKey)
      expect(fetchedKeys[0].accountId).toEqual(apiKey.accountId)
      expect(fetchedKeys[0].createdAt).toEqual(apiKey.createdAt)
      expect(fetchedKeys[0].updatedAt).toEqual(apiKey.updatedAt)
      expect(fetchedKeys[0]).not.toHaveProperty('key')
    })
  })

  describe('Redeem Session Key', (): void => {
    test('A session key can be redeemed for a valid api key', async (): Promise<void> => {
      const apiKey = await apiKeyService.create(account.id)
      const sessionKey = await apiKeyService.redeem(account.id, apiKey.key)
      expect(sessionKey.sessionKey).toBeDefined()
    })

    test('A session key cannot be redeemed if no api key for account exists', async (): Promise<void> => {
      const sessionKey = apiKeyService.redeem(account.id, '123')
      expect(sessionKey).rejects.toThrow(new NoExistingApiKeyError(account.id))
    })

    test('A session key cannot be redeemed if api key is unknown', async (): Promise<void> => {
      await apiKeyService.create(account.id)
      const sessionKey = apiKeyService.redeem(account.id, '123')
      expect(sessionKey).rejects.toThrow(new UnknownApiKeyError(account.id))
    })
  })

  describe('Delete Api Key', (): void => {
    test('All api keys for an account can be deleted', async (): Promise<void> => {
      await apiKeyService.create(account.id)
      await apiKeyService.create(account.id)
      await apiKeyService.deleteAll(account.id)
      const fetchedKeys = await apiKeyService.get(account.id)
      expect(fetchedKeys).toEqual([])
    })
  })
})
