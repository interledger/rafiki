import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../../app'
import { TestContainer, createTestApp } from '../../../tests/app'
import { initIocContainer } from '../../..'
import { Config, IAppConfig } from '../../../config/app'
import { CombinedPaymentService } from './service'
import { Knex } from 'knex'
import { truncateTables } from '../../../tests/tableManager'

describe('Combined Payment Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let config: IAppConfig
  let knex: Knex
  let combinedPaymentService: CombinedPaymentService

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    knex = appContainer.knex
    combinedPaymentService = await deps.use('combinedPaymentService')
    config = await deps.use('config')
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('Get CombinedPayments ', (): void => {
    test('should return empty array if no payments', async (): Promise<void> => {
      const payments = await combinedPaymentService.getPage()
      expect(payments).toEqual([])
    })

    test('should return empty array if no payments', async (): Promise<void> => {
      const payments = await combinedPaymentService.getPage()
      expect(payments).toEqual([])
    })
  })
})
