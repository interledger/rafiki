import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { createTestApp, TestContainer } from '../../tests/app'
// import { TenantSettingService } from './service'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { truncateTables } from '../../tests/tableManager'

describe('TenantSetting Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  //   let tenantSettingService: TenantSettingService

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    // tenantSettingService = await deps.use('tenantSettingService')
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(appContainer.knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })
})
