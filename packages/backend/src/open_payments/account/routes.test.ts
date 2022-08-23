import jestOpenAPI from 'jest-openapi'
import { Knex } from 'knex'
import { v4 as uuid } from 'uuid'

import { createContext } from '../../tests/context'
import { AccountService } from './service'
import { createTestApp, TestContainer } from '../../tests/app'
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
  let accountService: AccountService
  let config: IAppConfig
  let accountRoutes: AccountRoutes

  beforeAll(async (): Promise<void> => {
    config = Config
    config.adminUrl = 'https://wallet.example'
    config.authServerGrantUrl = 'https://auth.wallet.example/authorize'
    deps = await initIocContainer(config)
    appContainer = await createTestApp(deps)
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
    await appContainer.shutdown()
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
