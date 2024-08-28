import { BaseService } from '../shared/baseService'
import { TenantError } from './errors'
import { Tenant } from './model'

export interface CreateOptions {
  tenantId: string
  idpConsentEndpoint: string
  idpSecret: string
}

export interface TenantService {
  create(createOptions: CreateOptions): Promise<Tenant | TenantError>
  delete(tenantId: string): Promise<Tenant | undefined>
}

type ServiceDependencies = BaseService

export async function createTenantService({
  logger,
  knex
}: ServiceDependencies): Promise<TenantService> {
  const deps: ServiceDependencies = {
    logger: logger.child({
      service: 'TenantService'
    }),
    knex
  }

  return {
    create: (options: CreateOptions) => createTenant(deps, options),
    delete: (id: string) => deleteTenant(deps, id)
  }
}

async function deleteTenant(
  deps: ServiceDependencies,
  id: string
): Promise<Tenant | undefined> {
  return Tenant.query(deps.knex)
    .deleteById(id)
    .returning('*')
    .first()
}

async function createTenant(
  deps: ServiceDependencies,
  options: CreateOptions
): Promise<Tenant | TenantError> {
  const tenantData = {
    id: options.tenantId,
    idpConsentEndpoint: options.idpConsentEndpoint,
    idpSecret: options.idpSecret
  }

  try {
    const result = await Tenant.query(deps.knex).insert(tenantData)
    return result
  } catch (err) {
    deps.logger.warn(
      {
        tenantId: tenantData.id,
        idpConsentEndpoint: tenantData.idpConsentEndpoint
      },
      'Unable to create tenant'
    )

    throw err
  }
}
