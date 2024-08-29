import { GraphQLError } from 'graphql'
import { ApolloContext } from '../../app'
import {
  errorToCode,
  errorToMessage,
  isTenantError,
  TenantError
} from '../../tenant/errors'
import {
  MutationResolvers,
  QueryResolvers,
  ResolversTypes,
  TenantEndpointType
} from '../generated/graphql'
import { EndpointType } from '../../tenant/model'

const mapTenantEndpointTypeToModelEndpointType = {
  [TenantEndpointType.RatesUrl]: EndpointType.RatesUrl,
  [TenantEndpointType.WebhookBaseUrl]: EndpointType.WebhookBaseUrl
}

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

    return { tenant: tenantOrError }
  }

// export function tenantToGraphql(tenant: Tenant): SchemaTenant {
//   tenant.
//   return {
//     id: tenant.id,

//   }
// }
