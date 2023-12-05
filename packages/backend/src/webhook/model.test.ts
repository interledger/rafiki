import { Knex } from 'knex'
import { Config } from '../config/app'
import { createTestApp, TestContainer } from '../tests/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '..'
import { AppServices } from '../app'
import { truncateTables } from '../tests/tableManager'
import { AssetEventType, PeerEventType, RelatedResourceError } from './model'
import { WebhookEvent } from './model'

describe('WebhookEvent Model', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    knex = await deps.use('knex')
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(appContainer.knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('beforeInsert', (): void => {
    test.each([
      {
        type: PeerEventType.LiquidityLow,
        error: RelatedResourceError.PeerIdRequired
      },
      {
        type: AssetEventType.LiquidityLow,
        error: RelatedResourceError.AssetIdRequired
      }
    ])('$error', async ({ type, error }): Promise<void> => {
      expect(
        WebhookEvent.query(knex).insert({
          type
        })
      ).rejects.toThrow(error)
    })
  })
})
