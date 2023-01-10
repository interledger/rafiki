import { IocContract } from '@adonisjs/fold'
import { faker } from '@faker-js/faker'
import { Knex } from 'knex'

import { Grant } from './model'
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
    knex = appContainer.knex
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
    describe.each`
      existingAuthServer | description
      ${false}           | ${'new auth server'}
      ${true}            | ${'existing auth server'}
    `('$description', ({ existingAuthServer }): void => {
      let authServerId: string | undefined
      let grant: Grant | undefined
      const authServerUrl = faker.internet.url()

      beforeEach(async (): Promise<void> => {
        if (existingAuthServer) {
          const authServerService = await deps.use('authServerService')
          authServerId = (await authServerService.getOrCreate(authServerUrl)).id
        } else {
          await expect(
            AuthServer.query(knex).findOne({
              url: authServerUrl
            })
          ).resolves.toBeUndefined()
          authServerId = undefined
        }
        jest.useFakeTimers()
        jest.setSystemTime(Date.now())
      })

      afterEach(async (): Promise<void> => {
        jest.useRealTimers()
        if (existingAuthServer) {
          expect(grant.authServerId).toEqual(authServerId)
        } else {
          await expect(
            AuthServer.query(knex).findOne({
              url: authServerUrl
            })
          ).resolves.toMatchObject({
            id: grant.authServerId
          })
        }
      })

      test.each`
        expiresIn    | description
        ${undefined} | ${'without expiresIn'}
        ${600}       | ${'with expiresIn'}
      `(
        'Grant can be created and fetched ($description)',
        async ({ expiresIn }): Promise<void> => {
          const options: GrantOptions = {
            authServer: authServerUrl,
            accessType: AccessType.IncomingPayment,
            accessActions: [AccessAction.ReadAll]
          }
          grant = await grantService.create({
            ...options,
            expiresIn
          })
          expect(grant).toMatchObject({
            accessType: options.accessType,
            accessActions: options.accessActions,
            expiresAt: expiresIn
              ? new Date(Date.now() + expiresIn * 1000)
              : null
          })
          expect(grant.expired).toBe(false)
          await expect(grantService.get(options)).resolves.toEqual(grant)
        }
      )
    })

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
