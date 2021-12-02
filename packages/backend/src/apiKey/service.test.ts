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
import { ApiKeyError, isApiKeyError } from './errors'

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
      const apiKeyOptions = { accountId: account.id }
      const apiKey = await apiKeyService.create(apiKeyOptions)
      expect(apiKey.key).toBeDefined()
      expect(apiKey.hashedKey).toBeDefined()
      expect(apiKey.accountId).toBeDefined()
      expect(apiKey.createdAt).toBeDefined()
      expect(apiKey.updatedAt).toBeDefined()
      const match = await bcrypt.compare(apiKey.key, apiKey.hashedKey)
      expect(match).toBe(true)

      const fetchedKeys = await apiKeyService.get(apiKeyOptions)
      expect(fetchedKeys.length).toEqual(1)
      expect(fetchedKeys[0].hashedKey).toEqual(apiKey.hashedKey)
      expect(fetchedKeys[0].accountId).toEqual(apiKey.accountId)
      expect(fetchedKeys[0].createdAt).toEqual(apiKey.createdAt)
      expect(fetchedKeys[0].updatedAt).toEqual(apiKey.updatedAt)
      expect(fetchedKeys[0]).not.toHaveProperty('key')
    })
  })

  describe('Redeem Api Key for Session Key', (): void => {
    test('A valid api key can be redeemed for a session key', async (): Promise<void> => {
      const apiKey = await apiKeyService.create({ accountId: account.id })
      const sessionKeyOrError = await apiKeyService.redeem({
        accountId: account.id,
        key: apiKey.key
      })
      expect(isApiKeyError(sessionKeyOrError)).toEqual(false)
      if (isApiKeyError(sessionKeyOrError)) {
        fail()
      } else {
        expect(sessionKeyOrError.key).toBeDefined()
      }
    })

    test('A session key cannot be acquired if no api key for account exists', async (): Promise<void> => {
      const sessionKeyOrError = apiKeyService.redeem({
        accountId: account.id,
        key: '123'
      })
      expect(sessionKeyOrError).resolves.toEqual(ApiKeyError.UnknownApiKey)
    })

    test('A session key cannot be acquired if api key is unknown', async (): Promise<void> => {
      await apiKeyService.create({ accountId: account.id })
      const sessionKeyOrError = apiKeyService.redeem({
        accountId: account.id,
        key: '123'
      })
      expect(sessionKeyOrError).resolves.toEqual(ApiKeyError.UnknownApiKey)
    })
  })

  describe('Delete Api Key', (): void => {
    test('All api keys for an account can be deleted', async (): Promise<void> => {
      const apiKeyOptions = { accountId: account.id }
      await apiKeyService.create(apiKeyOptions)
      await apiKeyService.create(apiKeyOptions)
      await apiKeyService.deleteAll(apiKeyOptions)
      const fetchedKeys = await apiKeyService.get(apiKeyOptions)
      expect(fetchedKeys).toEqual([])
    })
  })
})
