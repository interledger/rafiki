import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../app'
import { EndpointOptions } from '../tenant/endpoints/service'
import { isTenantError } from '../tenant/errors'
import { Tenant } from '../tenant/model'

interface CreateOptions {
  email: string
  idpSecret: string
  idpConsentEndpoint: string
  endpoints: EndpointOptions[]
}

export async function createTenant(
  deps: IocContract<AppServices>,
  options: CreateOptions
): Promise<Tenant> {
  const tenantService = await deps.use('tenantService')
  const tenantOrError = await tenantService.create(options)
  if (isTenantError(tenantOrError)) {
    throw new Error(tenantOrError)
  }

  return tenantOrError
}
