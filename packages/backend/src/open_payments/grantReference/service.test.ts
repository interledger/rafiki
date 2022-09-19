import { Knex } from 'knex'
import { v4 as uuid } from 'uuid'

import { IocContract } from '@adonisjs/fold'
import { createTestApp, TestContainer } from '../../tests/app'
import { initIocContainer } from '../..'
import { AppServices } from '../../app'
import { Config } from '../../config/app'
import { GrantReferenceService } from './service'
import { truncateTables } from '../../tests/tableManager'
import { GrantReference } from './model'

describe('Grant Reference Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let grantReferenceService: GrantReferenceService
  let knex: Knex

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    knex = await deps.use('knex')
  })

  beforeEach(async (): Promise<void> => {
    grantReferenceService = await deps.use('grantReferenceService')
  })

  afterEach(async (): Promise<void> => {
    jest.useRealTimers()
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('Create and Get GrantReference', (): void => {
    test.each`
      transaction
      ${false}
      ${true}
    `(
      'a grant reference can be created and fetched - transaction: $transaction',
      async ({ transaction }): Promise<void> => {
        await GrantReference.transaction(async (trx) => {
          const id = uuid()
          const grantRef = await grantReferenceService.create(
            {
              id,
              clientId: uuid()
            },
            transaction ? trx : undefined
          )
          const retrievedRef = await grantReferenceService.get(
            id,
            transaction ? trx : undefined
          )
          expect(grantRef).toEqual(retrievedRef)
          if (transaction) {
            await trx.rollback()
            await expect(
              await grantReferenceService.get(id)
            ).resolves.toBeUndefined()
          }
        })
      }
    )

    test('cannot fetch non-existing grant reference', async (): Promise<void> => {
      await expect(grantReferenceService.get(uuid())).resolves.toBeUndefined()
    })
  })

  describe('Lock GrantReference', (): void => {
    test('a grant reference can be locked', async (): Promise<void> => {
      const grantRef = await grantReferenceService.create({
        id: uuid(),
        clientId: uuid()
      })
      const lock = async (): Promise<void> => {
        return await GrantReference.transaction(knex, async (trx) => {
          await grantReferenceService.lock(grantRef.id, trx)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await new Promise((f: any) => setTimeout(f, 6000))
          await grantReferenceService.get(grantRef.id, trx)
        })
      }
      await expect(Promise.all([lock(), lock()])).rejects.toThrowError(
        'Defined query timeout of 5000ms exceeded when running query.'
      )
    })
  })
})
