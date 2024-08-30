import { TransactionOrKnex } from 'objection'
import { BaseService } from '../../shared/baseService'
import { TenantEndpointError } from './errors'
import { EndpointType, TenantEndpoint } from './model'
import { Pagination, SortOrder } from '../../shared/baseModel'

export interface EndpointOptions {
  value: string
  type: EndpointType
}

export interface CreateOptions {
  endpoints: EndpointOptions[]
  tenantId: string
  trx?: TransactionOrKnex
}

export interface TenantEndpointService {
  create(
    createOptions: CreateOptions
  ): Promise<TenantEndpoint[] | TenantEndpointError>
  getForTenant(tenantId: string): Promise<TenantEndpoint[] | undefined>
  getPage(
    pagination?: Pagination,
    sortOrder?: SortOrder
  ): Promise<TenantEndpoint[]>
}

export interface ServiceDependencies extends BaseService {
  knex: TransactionOrKnex
}

export async function createTenantEndpointService(
  deps_: ServiceDependencies
): Promise<TenantEndpointService> {
  const deps: ServiceDependencies = {
    logger: deps_.logger.child({
      service: 'TenantEndpointService'
    }),
    knex: deps_.knex
  }

  return {
    create: (createOptions: CreateOptions) => {
      if (!createOptions.trx) {
        createOptions.trx = deps.knex
      }
      return createTenantEndpoint(deps, createOptions)
    },
    getForTenant: (tenantId: string) => getEndpointsForTenant(deps, tenantId),
    getPage: (pagination?, sortOrder?) =>
      getTenantEndpointsPage(deps, pagination, sortOrder)
  }
}

async function getTenantEndpointsPage(
  deps: ServiceDependencies,
  pagination?: Pagination,
  sortOrder?: SortOrder
) {
  console.log('GET TENANT ENDPOINTS PAGE')
  const data = await TenantEndpoint.query(deps.knex)
    .returning(['type', 'value', 'createdAt', 'updatedAt'])
    .getPage(pagination, sortOrder)
  console.log('DATA: ', data)
  return data
}

async function createTenantEndpoint(
  deps: ServiceDependencies,
  createOptions: CreateOptions
): Promise<TenantEndpoint[] | TenantEndpointError> {
  const tenantEndpointsData = createOptions.endpoints.map((endpoint) => ({
    type: endpoint.type,
    value: endpoint.value,
    tenantId: createOptions.tenantId
  }))

  return await TenantEndpoint.query(createOptions.trx)
    .insert(tenantEndpointsData)
    .returning(['type', 'value', 'createdAt', 'updatedAt'])
}

async function getEndpointsForTenant(
  deps: ServiceDependencies,
  tenantId: string
): Promise<TenantEndpoint[] | undefined> {
  return TenantEndpoint.query(deps.knex)
    .where('tenantId', tenantId)
    .returning(['type', 'value', 'createdAt', 'updatedAt'])
}
