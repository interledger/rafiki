import Knex from 'knex'
import { WorkerUtils, makeWorkerUtils } from 'graphile-worker'
import { v4 as uuid } from 'uuid'

import { HttpTokenService, HttpTokenError } from './service'
import { createTestApp, TestContainer } from '../tests/app'
import { HttpToken } from './model'
import { resetGraphileDb } from '../tests/graphileDb'
import { GraphileProducer } from '../messaging/graphileProducer'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'
import { truncateTables } from '../tests/tableManager'
import { AccountService } from '../account/service'
import { Account } from '../account/model'

describe('HTTP Token Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let workerUtils: WorkerUtils
  let httpTokenService: HttpTokenService
  let accountService: AccountService
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
    }
  )

  beforeEach(
    async (): Promise<void> => {
      httpTokenService = await deps.use('httpTokenService')
      accountService = await deps.use('accountService')
      account = await accountService.create(6, 'USD')
    }
  )

  afterAll(
    async (): Promise<void> => {
      await resetGraphileDb(knex)
      await truncateTables(knex)
      await appContainer.shutdown()
      await workerUtils.release()
    }
  )

  describe('Create Tokens', (): void => {
    test('Tokens can be created', async (): Promise<void> => {
      const httpToken = {
        accountId: account.id,
        token: uuid()
      }
      await expect(
        httpTokenService.create([httpToken])
      ).resolves.toBeUndefined()
      await expect(HttpToken.query().where(httpToken)).resolves.toHaveLength(1)

      const httpTokens = [
        {
          accountId: account.id,
          token: uuid()
        },
        {
          accountId: account.id,
          token: uuid()
        }
      ]
      await expect(httpTokenService.create(httpTokens)).resolves.toBeUndefined()
      await expect(
        HttpToken.query().where(httpTokens[0])
      ).resolves.toHaveLength(1)
      await expect(
        HttpToken.query().where(httpTokens[1])
      ).resolves.toHaveLength(1)
    })

    test('Cannot create token with unknown account', async (): Promise<void> => {
      const httpToken = {
        accountId: uuid(),
        token: uuid()
      }
      await expect(httpTokenService.create([httpToken])).resolves.toEqual(
        HttpTokenError.UnknownAccount
      )
      await expect(HttpToken.query().where(httpToken)).resolves.toHaveLength(0)
    })

    test('Cannot create duplicate token', async (): Promise<void> => {
      const token = uuid()
      const httpTokens = [
        {
          accountId: account.id,
          token
        },
        {
          accountId: account.id,
          token
        }
      ]
      await expect(httpTokenService.create(httpTokens)).resolves.toEqual(
        HttpTokenError.DuplicateToken
      )
      await expect(
        HttpToken.query().where({ accountId: account.id })
      ).resolves.toHaveLength(0)

      const httpToken = httpTokens[0]
      await expect(
        httpTokenService.create([httpToken])
      ).resolves.toBeUndefined()
      await expect(
        HttpToken.query().where({ accountId: account.id })
      ).resolves.toHaveLength(1)
      await expect(httpTokenService.create([httpToken])).resolves.toEqual(
        HttpTokenError.DuplicateToken
      )
      await expect(
        HttpToken.query().where({ accountId: account.id })
      ).resolves.toHaveLength(1)

      const newAccountToken = {
        accountId: (await accountService.create(6, 'EUR')).id,
        token
      }
      await expect(httpTokenService.create([newAccountToken])).resolves.toEqual(
        HttpTokenError.DuplicateToken
      )
      await expect(
        HttpToken.query().where(newAccountToken)
      ).resolves.toHaveLength(0)
    })
  })

  describe('Delete Tokens', (): void => {
    test('Tokens can be deleted by account id', async (): Promise<void> => {
      const httpTokens = [
        {
          accountId: account.id,
          token: uuid()
        },
        {
          accountId: account.id,
          token: uuid()
        }
      ]
      await expect(httpTokenService.create(httpTokens)).resolves.toBeUndefined()
      await expect(
        HttpToken.query().where({ accountId: account.id })
      ).resolves.toHaveLength(2)
      await expect(
        httpTokenService.deleteByAccount(account.id)
      ).resolves.toBeUndefined()
      await expect(
        HttpToken.query().where({ accountId: account.id })
      ).resolves.toHaveLength(0)
    })
  })
})
