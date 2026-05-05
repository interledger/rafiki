import { Knex } from 'knex'
import { Config } from '../../../config/app'
import { createTestApp, TestContainer } from '../../../tests/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../..'
import { AppServices } from '../../../app'
import { truncateTables } from '../../../tests/tableManager'
import {
  OutgoingPaymentEventError,
  OutgoingPaymentEvent,
  OutgoingPaymentEventType
} from './model'

describe('Outgoing Payment Event Model', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    knex = await deps.use('knex')
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(deps)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('beforeInsert', (): void => {
    test.each(
      Object.values(OutgoingPaymentEventType).map((type) => ({
        type,
        error: OutgoingPaymentEventError.OutgoingPaymentIdRequired
      }))
    )(
      'Outgoing Payment Id is required',
      async ({ type, error }): Promise<void> => {
        expect(
          OutgoingPaymentEvent.query(knex).insert({
            type
          })
        ).rejects.toThrow(error)
      }
    )
  })
})
