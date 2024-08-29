import { GraphQLError } from 'graphql'
import { ApolloContext } from '../../app'
import {
  errorToCode,
  errorToMessage,
  isTenantError,
  TenantError
} from '../../tenant/errors'
<<<<<<< HEAD
import { Tenant as SchemaTenant } from '../generated/graphql'
=======
>>>>>>> 7dbb74ab (feat(backend): update resolvers with tenant id and finish the tenant creation)
import {
  MutationResolvers,
  QueryResolvers,
  ResolversTypes,
  TenantEndpointType
} from '../generated/graphql'
<<<<<<< HEAD
import { Tenant } from '../../tenant/model'
import { Pagination, SortOrder } from '../../shared/baseModel'
import { getPageInfo } from '../../shared/pagination'
import { EndpointType } from '../../tenant/endpoints/model'
import { tenantEndpointToGraphql } from './tenant_endpoints'
=======
import { EndpointType } from '../../tenant/model'
>>>>>>> 7dbb74ab (feat(backend): update resolvers with tenant id and finish the tenant creation)

const mapTenantEndpointTypeToModelEndpointType = {
  [TenantEndpointType.RatesUrl]: EndpointType.RatesUrl,
  [TenantEndpointType.WebhookBaseUrl]: EndpointType.WebhookBaseUrl
}

<<<<<<< HEAD
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
=======
// export const getTenants: QueryResolvers<ApolloContext>['tenants'] = async (
//   _,
//   args,
//   ctx
// ): Promise<ResolversTypes['TenantsConnection']> => {
//   const tenantService = await ctx.container.use('tenantService')
//   const { sortOrder, ...pagination } = args
//   const order = sortOrder === 'ASC' ? SortOrder.Asc : SortOrder.Desc
//   const tenants = await tenantService.getPage()
// }

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
>>>>>>> 7dbb74ab (feat(backend): update resolvers with tenant id and finish the tenant creation)
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

  return tenant
}

export const createTenant: MutationResolvers<ApolloContext>['createTenant'] =
  async (
    _,
    args,
    ctx
  ): Promise<ResolversTypes['CreateTenantMutationResponse']> => {
    const tenantService = await ctx.container.use('tenantService')

    const tenantOrError = await tenantService.create({
      idpConsentEndpoint: args.input.idpConsentUrl,
      idpSecret: args.input.idpSecret,
      endpoints: args.input.endpoints.map((endpoint) => {
        return {
          value: endpoint.value,
          type: mapTenantEndpointTypeToModelEndpointType[endpoint.type]
        }
      }),
      email: args.input.email
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

<<<<<<< HEAD
export function tenantToGraphql(tenant: Tenant): SchemaTenant {
  return {
    id: tenant.id,
    email: tenant.email,
    kratosIdentityId: tenant.kratosIdentityId,
    // TODO: we should probably paginate this, but for now, that we only have like two endpoints it should be ok
    endpoints: tenant.endpoints.map(tenantEndpointToGraphql),
    createdAt: tenant.createdAt.toISOString(),
    updatedAt: tenant.updatedAt.toISOString()
  }
}
=======
// export function tenantToGraphql(tenant: Tenant): SchemaTenant {
//   tenant.
//   return {
//     id: tenant.id,

//   }
// }
>>>>>>> 7dbb74ab (feat(backend): update resolvers with tenant id and finish the tenant creation)
