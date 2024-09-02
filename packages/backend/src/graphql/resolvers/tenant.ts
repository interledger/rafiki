import { GraphQLError } from 'graphql'
import { ApolloContext } from '../../app'
import {
  errorToCode,
  errorToMessage,
  isTenantError,
  TenantError
} from '../../tenant/errors'
import { Tenant as SchemaTenant } from '../generated/graphql'
import {
  MutationResolvers,
  QueryResolvers,
  ResolversTypes,
  TenantEndpointType
} from '../generated/graphql'
import { Tenant } from '../../tenant/model'
import { Pagination, SortOrder } from '../../shared/baseModel'
import { getPageInfo } from '../../shared/pagination'
import { EndpointType, TenantEndpoint } from '../../tenant/endpoints/model'
import { tenantEndpointToGraphql } from './tenant_endpoints'

const mapTenantEndpointTypeToModelEndpointType = {
  [TenantEndpointType.RatesUrl]: EndpointType.RatesUrl,
  [TenantEndpointType.WebhookBaseUrl]: EndpointType.WebhookBaseUrl
}

export const getTenants: QueryResolvers<ApolloContext>['tenants'] = async (
  _,
  args,
  ctx
): Promise<ResolversTypes['TenantsConnection']> => {
  const tenantService = await ctx.container.use('tenantService')
  const { sortOrder, ...pagination } = args
  const order = sortOrder === 'ASC' ? SortOrder.Asc : SortOrder.Desc
  const tenants = await tenantService.getPage(pagination, order)
  const pageInfo = await getPageInfo({
    getPage: (pagination: Pagination, sortOrder?: SortOrder) =>
      tenantService.getPage(pagination, sortOrder),
    page: tenants,
    sortOrder: order
  })

  return {
    pageInfo,
    edges: tenants.map((tenant: Tenant) => ({
      cursor: tenant.id,
      node: tenantToGraphql(tenant)
    }))
  }
}

export const getTenant: QueryResolvers<ApolloContext>['tenant'] = async (
  _,
  args,
  ctx
): Promise<ResolversTypes['Tenant']> => {
  const tenantService = await ctx.container.use('tenantService')
  const tenant = await tenantService.get(args.id)

  if (!tenant) {
    throw new GraphQLError(errorToMessage[TenantError.UnknownTenant], {
      extensions: {
        code: errorToCode[TenantError.UnknownTenant]
      }
    })
  }

  return tenantToGraphql(tenant)
}

export const createTenant: MutationResolvers<ApolloContext>['createTenant'] =
  async (
    _,
    args,
    ctx
  ): Promise<ResolversTypes['CreateTenantMutationResponse']> => {
    const tenantService = await ctx.container.use('tenantService')

    const tenantOrError = await tenantService.create({
      idpConsentEndpoint: args.input.idpConsentEndpoint,
      idpSecret: args.input.idpSecret,
      endpoints: args.input.endpoints.map((endpoint) => {
        return {
          value: endpoint.value,
          type: mapTenantEndpointTypeToModelEndpointType[endpoint.type]
        }
      })
    })

    if (isTenantError(tenantOrError)) {
      throw new GraphQLError(errorToMessage[tenantOrError], {
        extensions: {
          code: errorToCode[tenantOrError]
        }
      })
    }

    return {
      tenant: tenantToGraphql(tenantOrError)
    }
  }

export function tenantToGraphql(tenant: Tenant): SchemaTenant {
  return {
    id: tenant.id,
    kratosIdentityId: tenant.kratosIdentityId,
    //we should probably paginate this, but for now, that we only have like two endpoints it should be ok
    endpoints: tenant.endpoints.map(tenantEndpointToGraphql),
    createdAt: new Date(tenant.createdAt).toISOString(),
    updatedAt: new Date(tenant.updatedAt).toISOString()
  }
}
