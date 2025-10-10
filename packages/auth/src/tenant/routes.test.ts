import { IocContract } from '@adonisjs/fold'
import { v4 } from 'uuid'

import { createContext } from '../tests/context'
import { createTestApp, TestContainer } from '../tests/app'
import { Config } from '../config/app'
import { initIocContainer } from '..'
import { AppServices } from '../app'
import { truncateTables } from '../tests/tableManager'
import {
  CreateContext,
  UpdateContext,
  DeleteContext,
  TenantRoutes,
  createTenantRoutes
} from './routes'
import { TenantService } from './service'
import { Tenant } from './model'

describe('Tenant Routes', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let tenantRoutes: TenantRoutes
  let tenantService: TenantService

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    tenantService = await deps.use('tenantService')
    const logger = await deps.use('logger')

    tenantRoutes = createTenantRoutes({
      tenantService,
      logger
    })
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(deps)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('create', (): void => {
    test('Creates a tenant', async (): Promise<void> => {
      const tenantData = {
        id: v4(),
        apiSecret: v4(),
        idpConsentUrl: 'https://example.com/consent',
        idpSecret: 'secret123'
      }

      const ctx = createContext<CreateContext>(
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
          }
        },
        {}
      )
      ctx.request.body = tenantData

      await expect(tenantRoutes.create(ctx)).resolves.toBeUndefined()
      expect(ctx.status).toBe(204)
      expect(ctx.body).toBe(undefined)

      const tenant = await Tenant.query().findById(tenantData.id)
      expect(tenant).toBeDefined()
      expect(tenant?.apiSecret).toBe(tenantData.apiSecret)
      expect(tenant?.idpConsentUrl).toBe(tenantData.idpConsentUrl)
      expect(tenant?.idpSecret).toBe(tenantData.idpSecret)
    })
  })

  describe('update', (): void => {
    test('Updates a tenant', async (): Promise<void> => {
      const tenant = await Tenant.query().insert({
        id: v4(),
        apiSecret: v4(),
        idpConsentUrl: 'https://example.com/consent',
        idpSecret: 'secret123'
      })

      const updateData = {
        apiSecret: v4(),
        idpConsentUrl: 'https://example.com/new-consent',
        idpSecret: 'newSecret123'
      }

      const ctx = createContext<UpdateContext>(
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
          }
        },
        {
          id: tenant.id
        }
      )
      ctx.request.body = updateData

      await expect(tenantRoutes.update(ctx)).resolves.toBeUndefined()
      expect(ctx.status).toBe(204)
      expect(ctx.body).toBe(undefined)

      const updatedTenant = await Tenant.query().findById(tenant.id)
      expect(updatedTenant?.apiSecret).toBe(updateData.apiSecret)
      expect(updatedTenant?.idpConsentUrl).toBe(updateData.idpConsentUrl)
      expect(updatedTenant?.idpSecret).toBe(updateData.idpSecret)
    })

    test('Returns 404 when updating non-existent tenant', async (): Promise<void> => {
      const ctx = createContext<UpdateContext>(
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
          }
        },
        {
          id: v4()
        }
      )
      ctx.request.body = {
        idpConsentUrl: 'https://example.com/new-consent'
      }

      await expect(tenantRoutes.update(ctx)).resolves.toBeUndefined()
      expect(ctx.status).toBe(404)
    })
  })

  describe('delete', (): void => {
    test('Deletes a tenant', async (): Promise<void> => {
      const tenant = await Tenant.query().insert({
        id: v4(),
        apiSecret: v4(),
        idpConsentUrl: 'https://example.com/consent',
        idpSecret: 'secret123'
      })

      const ctx = createContext<DeleteContext>(
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
          }
        },
        {
          id: tenant.id
        }
      )
      ctx.request.body = { deletedAt: new Date().toISOString() }

      await expect(tenantRoutes.delete(ctx)).resolves.toBeUndefined()
      expect(ctx.status).toBe(204)

      const deletedTenant = await Tenant.query().findById(tenant.id)
      expect(deletedTenant?.deletedAt).not.toBeNull()
    })

    test('Returns 404 when deleting non-existent tenant', async (): Promise<void> => {
      const ctx = createContext<DeleteContext>(
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
          }
        },
        {
          id: v4()
        }
      )
      ctx.request.body = { deletedAt: new Date().toISOString() }

      await expect(tenantRoutes.delete(ctx)).resolves.toBeUndefined()
      expect(ctx.status).toBe(404)
    })
  })
})
