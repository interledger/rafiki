import jestOpenAPI from 'jest-openapi'
import Knex from 'knex'
import { WorkerUtils, makeWorkerUtils } from 'graphile-worker'
import { v4 as uuid } from 'uuid'

import { createContext } from '../../tests/context'
import { AccountService } from './service'
import { createTestApp, TestContainer } from '../../tests/app'
import { resetGraphileDb } from '../../tests/graphileDb'
import { GraphileProducer } from '../../messaging/graphileProducer'
import { Config, IAppConfig } from '../../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../'
import { AppServices, AccountContext } from '../../app'
import { truncateTables } from '../../tests/tableManager'
import { randomAsset } from '../../tests/asset'
import { AccountRoutes } from './routes'
import { faker } from '@faker-js/faker'

describe('Account Routes', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let workerUtils: WorkerUtils
  let accountService: AccountService
  let config: IAppConfig
  let accountRoutes: AccountRoutes
  const messageProducer = new GraphileProducer()
  const mockMessageProducer = {
    send: jest.fn()
  }

  beforeAll(async (): Promise<void> => {
    config = Config
    config.publicHost = 'https://wallet.example'
    config.authServerGrantUrl = 'https://auth.wallet.example/authorize'
    deps = await initIocContainer(config)
    deps.bind('messageProducer', async () => mockMessageProducer)
    appContainer = await createTestApp(deps)
    workerUtils = await makeWorkerUtils({
      connectionString: appContainer.connectionUrl
    })
    await workerUtils.migrate()
    messageProducer.setUtils(workerUtils)
    knex = await deps.use('knex')
    jestOpenAPI(await deps.use('openApi'))
  })

  beforeEach(async (): Promise<void> => {
    accountService = await deps.use('accountService')
    config = await deps.use('config')
    accountRoutes = await deps.use('accountRoutes')
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await resetGraphileDb(knex)
    await appContainer.shutdown()
    await workerUtils.release()
  })

  describe('get', (): void => {
    test('returns 404 for nonexistent account', async (): Promise<void> => {
      const ctx = createContext<AccountContext>(
        {
          headers: { Accept: 'application/json' }
        },
        { accountId: uuid() }
      )
      await expect(accountRoutes.get(ctx)).rejects.toHaveProperty('status', 404)
    })

    test('returns 200 with an open payments account', async (): Promise<void> => {
      const asset = randomAsset()
      const publicName = faker.name.firstName()
      const account = await accountService.create({
        publicName: publicName,
        asset: asset
      })

      const ctx = createContext<AccountContext>(
        {
          headers: { Accept: 'application/json' },
          url: `/${account.id}`
        },
        { accountId: account.id }
      )
      await expect(accountRoutes.get(ctx)).resolves.toBeUndefined()
      expect(ctx.response).toSatisfyApiSpec()
      expect(ctx.body).toEqual({
        id: `https://wallet.example/${account.id}`,
        publicName: account.publicName,
        assetCode: asset.code,
        assetScale: asset.scale,
        authServer: 'https://auth.wallet.example/authorize'
      })
    })
  })
})
