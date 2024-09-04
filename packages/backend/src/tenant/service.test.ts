import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../app'
import { createTestApp, TestContainer } from '../tests/app'
import { TenantService } from './service'
import { initIocContainer } from '..'
import { Config, IAppConfig } from '../config/app'
import { truncateTables } from '../tests/tableManager'
import {
  createTenant,
  mockAdminAuthApiTenantCreation,
  randomTenant
} from '../tests/tenant'
import assert from 'assert'
import { isTenantError } from './errors'
import { Scope } from 'nock'
import { v4 as uuidv4 } from 'uuid'
import { Pagination, SortOrder } from '../shared/baseModel'
import { getPageTests } from '../shared/baseModel.test'

describe('Tenant Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let tenantService: TenantService
  let scope: Scope
  let config: IAppConfig

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    tenantService = await deps.use('tenantService')
    config = await deps.use('config')
    scope = mockAdminAuthApiTenantCreation(config.authAdminApiUrl).persist()
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(appContainer.knex)
  })

  afterAll(async (): Promise<void> => {
    scope.done()
    await appContainer.shutdown()
  })

  describe('get', (): void => {
    it('can get tenant by id', async (): Promise<void> => {
      const tenant = await tenantService.create(randomTenant())
      assert.ok(!isTenantError(tenant))
      await expect(tenantService.get(tenant.id)).resolves.toEqual(tenant)
    })

    it('cannot get unknown tenant', async (): Promise<void> => {
      await expect(tenantService.get(uuidv4())).resolves.toBeUndefined()
    })
  })

  describe('getPage', (): void => {
    getPageTests({
      createModel: () => createTenant(deps),
      getPage: (pagination?: Pagination, sortOrder?: SortOrder) =>
        tenantService.getPage(pagination, sortOrder)
    })
  })
})
