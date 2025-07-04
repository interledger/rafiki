import { GraphQLError } from 'graphql'
import { TenantedApolloContext } from '../../app'
import {
  MutationResolvers,
  QueryResolvers,
  ResolversTypes,
  Tenant as SchemaTenant
} from '../generated/graphql'
import { GraphQLErrorCode } from '../errors'
import { Tenant } from '../../tenants/model'
import { Pagination, SortOrder } from '../../shared/baseModel'
import { getPageInfo } from '../../shared/pagination'
import { tenantSettingsToGraphql } from './tenant_settings'
import { errorToMessage, isTenantError } from '../../tenants/errors'

export const whoami: QueryResolvers<TenantedApolloContext>['whoami'] = async (
  parent,
  args,
  ctx
): Promise<ResolversTypes['WhoamiResponse']> => {
  const { tenant, isOperator } = ctx

  return {
    id: tenant.id,
    isOperator
  }
}

export const getTenant: QueryResolvers<TenantedApolloContext>['tenant'] =
  async (parent, args, ctx): Promise<ResolversTypes['Tenant']> => {
    const { tenant: contextTenant, isOperator } = ctx

    // TODO: make this a util
    // If the tenant that was authorized in the request is not the tenant being requested,
    // or the requester is not the operator, return not found
    if (args.id !== contextTenant.id && !isOperator) {
      throw new GraphQLError('tenant does not exist', {
        extensions: {
          code: GraphQLErrorCode.NotFound
        }
      })
    }

    const tenantService = await ctx.container.use('tenantService')
    const tenant = await tenantService.get(args.id, isOperator)
    if (!tenant) {
      throw new GraphQLError('tenant does not exist', {
        extensions: {
          code: GraphQLErrorCode.NotFound
        }
      })
    }

    return tenantToGraphQl(tenant)
  }

export const getTenants: QueryResolvers<TenantedApolloContext>['tenants'] =
  async (parent, args, ctx): Promise<ResolversTypes['TenantsConnection']> => {
    const { isOperator } = ctx
    if (!isOperator) {
      throw new GraphQLError('cannot get tenants page', {
        extensions: {
          code: GraphQLErrorCode.Forbidden
        }
      })
    }

    const { sortOrder, ...pagination } = args
    const order = sortOrder === 'ASC' ? SortOrder.Asc : SortOrder.Desc
    const tenantService = await ctx.container.use('tenantService')

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
        node: tenantToGraphQl(tenant)
      }))
    }
  }

export const createTenant: MutationResolvers<TenantedApolloContext>['createTenant'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['TenantMutationResponse']> => {
    // createTenant is an operator-only resolver
    const { isOperator } = ctx
    if (!isOperator) {
      throw new GraphQLError('permission denied', {
        extensions: {
          code: GraphQLErrorCode.Forbidden
        }
      })
    }

    const tenantService = await ctx.container.use('tenantService')
    const tenantOrError = await tenantService.create(args.input)
    if (isTenantError(tenantOrError)) {
      throw new GraphQLError(errorToMessage[tenantOrError], {
        extensions: {
          code: GraphQLErrorCode.BadUserInput
        }
      })
    }

    return { tenant: tenantToGraphQl(tenantOrError) }
  }

export const updateTenant: MutationResolvers<TenantedApolloContext>['updateTenant'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['TenantMutationResponse']> => {
    const { tenant: contextTenant, isOperator } = ctx
    // TODO: make this a util
    if (args.input.id !== contextTenant.id && !isOperator) {
      throw new GraphQLError('tenant does not exist', {
        extensions: {
          code: GraphQLErrorCode.NotFound
        }
      })
    }

    if (isOperator && 'apiSecret' in args.input) {
      throw new GraphQLError(
        'Operator cannot update apiSecret over admin api',
        {
          extensions: {
            code: GraphQLErrorCode.BadUserInput
          }
        }
      )
    }

    const tenantService = await ctx.container.use('tenantService')
    try {
      const updatedTenant = await tenantService.update(args.input)
      return { tenant: tenantToGraphQl(updatedTenant) }
    } catch (err) {
      throw new GraphQLError('failed to update tenant', {
        extensions: {
          code: GraphQLErrorCode.NotFound
        }
      })
    }
  }

export const deleteTenant: MutationResolvers<TenantedApolloContext>['deleteTenant'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['DeleteTenantMutationResponse']> => {
    const { isOperator } = ctx
    if (!isOperator) {
      throw new GraphQLError('permission denied', {
        extensions: {
          code: GraphQLErrorCode.Forbidden
        }
      })
    }

    const tenantService = await ctx.container.use('tenantService')
    try {
      await tenantService.delete(args.id)
      return { success: true }
    } catch (err) {
      throw new GraphQLError('failed to delete tenant', {
        extensions: {
          code: GraphQLErrorCode.NotFound
        }
      })
    }
  }

export function tenantToGraphQl(tenant: Tenant): SchemaTenant {
  return {
    id: tenant.id,
    email: tenant.email,
    apiSecret: tenant.apiSecret,
    idpConsentUrl: tenant.idpConsentUrl,
    idpSecret: tenant.idpSecret,
    publicName: tenant.publicName,
    settings: tenantSettingsToGraphql(tenant.settings),
    createdAt: new Date(+tenant.createdAt).toISOString(),
    deletedAt: tenant.deletedAt
      ? new Date(+tenant.deletedAt).toISOString()
      : null
  }
}
