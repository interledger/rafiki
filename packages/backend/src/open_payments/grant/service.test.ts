import { IocContract } from '@adonisjs/fold'
import { faker } from '@faker-js/faker'
import { Knex } from 'knex'

import { GrantOptions, GrantService } from './service'
import { AccessType, AccessAction } from '../auth/grant'
import { AuthServer } from '../authServer/model'
import { initIocContainer } from '../..'
import { AppServices } from '../../app'
import { Config } from '../../config/app'
import { createTestApp, TestContainer } from '../../tests/app'
import { truncateTables } from '../../tests/tableManager'

describe('Grant Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let grantService: GrantService
  let knex: Knex

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    knex = await deps.use('knex')
  })

  beforeEach(async (): Promise<void> => {
    grantService = await deps.use('grantService')
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('Create and Get Grant', (): void => {
    test.each`
      newAuthServer
      ${false}
      ${true}
    `(
      'Grant can be created and fetched (new auth server: $newAuthServer)',
      async ({ newAuthServer }): Promise<void> => {
        const authServerService = await deps.use('authServerService')
        let authServerId: string | undefined
        const authServerUrl = faker.internet.url()
        if (newAuthServer) {
          await expect(
            AuthServer.query(knex).findOne({
              url: authServerUrl
            })
          ).resolves.toBeUndefined()
        } else {
          authServerId = (await authServerService.getOrCreate(authServerUrl)).id
        }
        const options: GrantOptions = {
          authServer: authServerUrl,
          accessType: AccessType.IncomingPayment,
          accessActions: [AccessAction.ReadAll]
        }
        const grant = await grantService.create(options)
        expect(grant).toMatchObject({
          accessType: options.accessType,
          accessActions: options.accessActions
        })
        if (newAuthServer) {
          await expect(
            AuthServer.query(knex).findOne({
              url: authServerUrl
            })
          ).resolves.toMatchObject({
            id: grant.authServerId
          })
        } else {
          expect(grant.authServerId).toEqual(authServerId)
        }
        await expect(grantService.get(options)).resolves.toEqual(grant)
      }
    )

    test('cannot fetch non-existing grant', async (): Promise<void> => {
      const options: GrantOptions = {
        authServer: faker.internet.url(),
        accessType: AccessType.IncomingPayment,
        accessActions: [AccessAction.ReadAll]
      }
      await grantService.create(options)
      await expect(
        grantService.get({
          ...options,
          authServer: faker.internet.url()
        })
      ).resolves.toBeUndefined()
      await expect(
        grantService.get({
          ...options,
          accessType: AccessType.Quote
        })
      ).resolves.toBeUndefined()
      await expect(
        grantService.get({
          ...options,
          accessActions: [AccessAction.Read]
        })
      ).resolves.toBeUndefined()
    })
  })
})
