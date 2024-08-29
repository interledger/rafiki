import { TransactionOrKnex } from 'objection'
import { BaseService } from '../shared/baseService'
import { TenantError } from './errors'
import { EndpointType, Tenant, TenantEndpoints } from './model'
import { IAppConfig } from '../config/app'
import { ApolloClient, gql, NormalizedCacheObject } from '@apollo/client'
import {
  Tenant as AuthTenant,
  CreateTenantInput as CreateAuthTenantInput
} from '../generated/graphql'
import { v4 as uuidv4 } from 'uuid'
import { Pagination, SortOrder } from '../shared/baseModel'

export interface EndpointOptions {
  value: string
  type: EndpointType
}

export interface CreateTenantOptions {
  idpConsentEndpoint: string
  idpSecret: string
  endpoints: EndpointOptions[]
}

export interface TenantService {
  get(id: string): Promise<Tenant | undefined>
  getPage(pagination?: Pagination, sortOrder?: SortOrder): Promise<Tenant[]>
  create(CreateOptions: CreateTenantOptions): Promise<Tenant | TenantError>
}

export interface ServiceDependencies extends BaseService {
  knex: TransactionOrKnex
  config: IAppConfig
  apolloClient: ApolloClient<NormalizedCacheObject>
}

export async function createTenantService(
  deps_: ServiceDependencies
): Promise<TenantService> {
  const deps: ServiceDependencies = {
    logger: deps_.logger.child({
      service: 'TenantService'
    }),
    knex: deps_.knex,
    config: deps_.config,
    apolloClient: deps_.apolloClient
  }

  return {
    get: (id: string) => getTenant(deps, id),
    getPage: (pagination?, sortOrder?) =>
      getTenantsPage(deps, pagination, sortOrder),
    create: (options: CreateTenantOptions) => createTenant(deps, options)
  }
}

async function getTenantsPage(
  deps: ServiceDependencies,
  pagination?: Pagination,
  sortOrder?: SortOrder
): Promise<Tenant[]> {
  return await Tenant.query(deps.knex).getPage(pagination, sortOrder)
}

async function getTenant(
  deps: ServiceDependencies,
  id: string
): Promise<Tenant | undefined> {
  return Tenant.query(deps.knex)
    .findById(id)
}

async function createTenant(
  deps: ServiceDependencies,
  options: CreateTenantOptions
): Promise<Tenant | TenantError> {
  /**
   * 1. Open DB transaction
   * 2. Insert tenant data into DB
   * 3. Call Auth Admin API to create tenant
   * 3.1 if success, commit DB trx and return tenant data
   * 3.2 if error, rollback DB trx and return error
   */
  return deps.knex.transaction(async (trx) => {
    let tenant: Tenant
    try {
      // create tenant on backend
      tenant = await Tenant.query(trx).insert({
        kratosIdentityId: uuidv4()
      })

      const tenantEndpointsData = options.endpoints.map((endpoint) => ({
        type: endpoint.type,
        value: endpoint.value,
        tenantId: tenant.id
      }))

      await TenantEndpoints.query(trx)
        .insert(tenantEndpointsData)
        .returning(['type', 'value'])

      // call auth admin api
      const mutation = gql`
        mutation CreateAuthTenant($input: CreateTenantInput!) {
          createTenant(input: $input) {
            tenant {
              id
            }
          }
        }
      `
      const variables = {
        input: {
          tenantId: tenant.id,
          idpSecret: options.idpSecret,
          idpConsentEndpoint: options.idpConsentEndpoint
        }
      }

      await deps.apolloClient.mutate<
        AuthTenant,
        { input: CreateAuthTenantInput }
      >({
        mutation,
        variables
      })
    } catch (err) {
      await trx.rollback()
      throw err
    }

    return tenant
  })
}
