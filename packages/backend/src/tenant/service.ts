import { Tenant } from "../graphql/generated/graphql"
import { BaseService } from "../shared/baseService"
import { TenantError } from "./errors"
import { EndpointType } from "./model"

interface EndpointOptions {
    value: string
    type: EndpointType
}

export interface CreateTenantOptions {
    idpEndpoint: string
    idpSecret: string
    endpoints: EndpointOptions[]
}

export interface TenantService {
    create(CreateOptions: CreateTenantOptions): Promise<Tenant | TenantError>
}

type ServiceDependencies = BaseService

export async function createTenantService({
    logger, knex
}: ServiceDependencies): Promise<TenantService> {
    const deps: ServiceDependencies = {
        logger: logger.child({
          service: 'TenantService'
        }),
        knex
    }

    return {
        create: (options: CreateTenantOptions) => createTenant(deps, options)
    }
}

async function createTenant(
    deps: ServiceDependencies,
    options: CreateTenantOptions
): Promise<Tenant | TenantError> {
    return TenantError.UnknownError
}