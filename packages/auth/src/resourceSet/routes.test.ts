import { IocContract } from '@adonisjs/fold'
import { Knex } from 'knex'
import { v4 } from 'uuid'

import { initIocContainer } from '../'
import { AppServices } from '../app'
import { createTestApp, TestContainer } from '../tests/app'
import { Config } from '../config/app'
import { ResourceSetRoutes } from './routes'
import { Action, AccessType } from '../access/types'
import { JWKWithRequired } from '../client/service'
import { generateTestKeys } from '../tests/signature'
import { ResourceSet } from './model'
import { createContext } from '../tests/context'
import { truncateTables } from '../tests/tableManager'

describe('Resource Set Routes', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let resourceSetRoutes: ResourceSetRoutes
  let knex: Knex
  let trx: Knex.Transaction

  let publicKey: JWKWithRequired

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    resourceSetRoutes = await deps.use('resourceSetRoutes')
    knex = await deps.use('knex')
    appContainer = await createTestApp(deps)
    const keys = await generateTestKeys()
    publicKey = keys.publicKey
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('register', (): void => {
    test('Can register a resource set and get a reference', async (): Promise<void> => {
      const ctx = createContext(
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
          }
        },
        {}
      )

      ctx.request.body = {
        access: [
          {
            actions: [Action.Create, Action.Read, Action.List],
            locations: ['https://example.com'],
            identifier: `https://example.com/${v4()}`,
            type: AccessType.IncomingPayment
          }
        ],
        key: {
          proof: 'httpsig',
          jwk: publicKey
        }
      }

      await expect(resourceSetRoutes.create(ctx)).resolves.toBeUndefined()
      expect(ctx.status).toBe(200)

      const dbResourceSet = await ResourceSet.query(trx).findById(
        ctx.body.resource_reference
      )
      expect(dbResourceSet).not.toBeUndefined()
    })
  })
})
