import { IocContract } from '@adonisjs/fold'
import { faker } from '@faker-js/faker'
import { Knex } from 'knex'

import { AuthServer } from './model'
import { AuthServerService } from './service'
import { initIocContainer } from '../../'
import { AppServices } from '../../app'
import { Config } from '../../config/app'
import { createTestApp, TestContainer } from '../../tests/app'
import { truncateTables } from '../../tests/tableManager'

describe('Auth Server Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let authServerService: AuthServerService
  let knex: Knex

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    knex = appContainer.knex
    authServerService = await deps.use('authServerService')
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('getOrCreate', (): void => {
    test('Auth server can be created or fetched', async (): Promise<void> => {
      const url = faker.internet.url()
      await expect(
        AuthServer.query(knex).findOne({ url })
      ).resolves.toBeUndefined()
      const authServer = await authServerService.getOrCreate(url)
      await expect(authServer).toMatchObject({ url })
      await expect(AuthServer.query(knex).findOne({ url })).resolves.toEqual(
        authServer
      )
      await expect(authServerService.getOrCreate(url)).resolves.toEqual(
        authServer
      )
    })
  })
})
