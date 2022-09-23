import { IocContract } from '@adonisjs/fold'
import { Knex } from 'knex'
import { v4 } from 'uuid'

import { initIocContainer } from '../'
import { AppServices } from '../app'
import { createTestApp, TestContainer } from '../tests/app'
import { Config } from '../config/app'
import { ResourceSetService } from './service'
import { Action, AccessType } from '../access/types'
import { Access } from '../access/model'
import { JWKWithRequired } from '../client/service'
import { generateTestKeys } from '../tests/signature'
import { ResourceSet } from './model'
import { truncateTables } from '../tests/tableManager'

describe('Resource Set Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let resourceSetService: ResourceSetService
  let knex: Knex
  let trx: Knex.Transaction

  let publicKey: JWKWithRequired

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    resourceSetService = await deps.use('resourceSetService')
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

  describe('create', (): void => {
    test('Can create a resource set', async (): Promise<void> => {
      const req = {
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

      const resourceSet = await resourceSetService.create(req)
      const dbResourceSet = await ResourceSet.query(trx).findById(
        resourceSet.id
      )

      expect(dbResourceSet).not.toBeUndefined()
      expect(resourceSet.keyProof).toEqual(req.key.proof)
      expect(resourceSet.keyJwk).toEqual(req.key.jwk)

      const dbAccesses = await Access.query(trx).where({
        resourceId: resourceSet.id
      })

      expect(dbAccesses[0].actions).toEqual(req.access[0].actions)
      expect(dbAccesses[0].locations).toEqual(req.access[0].locations)
      expect(dbAccesses[0].identifier).toEqual(req.access[0].identifier)
      expect(dbAccesses[0].type).toEqual(req.access[0].type)
    })

    test('Can create a resource set with only access field', async (): Promise<void> => {
      const req = {
        access: [
          {
            actions: [Action.Create, Action.Read, Action.List],
            locations: ['https://example.com'],
            identifier: `https://example.com/${v4()}`,
            type: AccessType.IncomingPayment
          }
        ]
      }

      const resourceSet = await resourceSetService.create(req)
      const dbResourceSet = await ResourceSet.query(trx).findById(
        resourceSet.id
      )

      expect(dbResourceSet).not.toBeUndefined()
      expect(resourceSet.keyProof).toBeNull()
      expect(resourceSet.keyJwk).toBeNull()

      const dbAccesses = await Access.query(trx).where({
        resourceId: resourceSet.id
      })

      expect(dbAccesses[0].actions).toEqual(req.access[0].actions)
      expect(dbAccesses[0].locations).toEqual(req.access[0].locations)
      expect(dbAccesses[0].identifier).toEqual(req.access[0].identifier)
      expect(dbAccesses[0].type).toEqual(req.access[0].type)
    })

    test('Can create a resource set with only key field', async (): Promise<void> => {
      const req = {
        key: {
          proof: 'httpsig',
          jwk: publicKey
        }
      }

      const resourceSet = await resourceSetService.create(req)
      const dbResourceSet = await ResourceSet.query(trx).findById(
        resourceSet.id
      )

      expect(dbResourceSet).not.toBeUndefined()
      expect(resourceSet.keyProof).toEqual(req.key.proof)
      expect(resourceSet.keyJwk).toEqual(req.key.jwk)

      const dbAccesses = await Access.query(trx).where({
        resourceId: resourceSet.id
      })

      expect(dbAccesses).toHaveLength(0)
    })
  })
})
