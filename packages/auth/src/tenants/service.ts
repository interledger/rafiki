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
    create: (options: CreateOptions) => createTenant(deps, options)
  }
}

async function createTenant(
  deps: ServiceDependencies,
  options: CreateOptions
): Promise<Tenant | TenantError> {
  return TenantError.UnknownError
}
