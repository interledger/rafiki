import Koa from 'koa'
import { GraphQLError } from 'graphql'
import { TenantedApolloContext, TenantedAppContext } from '../app'
import { GraphQLErrorCode } from '../graphql/errors'
import { getTenantFromApiSignature } from '../shared/utils'

export async function authenticatedTenantMiddleware(
  ctx: TenantedAppContext,
  next: Koa.Next
): Promise<void> {
  const config = await ctx.container.use('config')
  const result = await getTenantFromApiSignature(ctx, config)
  if (!result) {
    ctx.throw(401, 'Unauthorized')
  } else {
    ctx.tenantApiSignatureResult = {
      tenant: result.tenant,
      isOperator: result.isOperator
    }
  }
  return next()
}

// Used in test environment only
export async function unauthenticatedTenantMiddleware(
  ctx: TenantedAppContext,
  next: Koa.Next
): Promise<void> {
  if (ctx.headers['tenant-id']) {
    const config = await ctx.container.use('config')
    const tenantService = await ctx.container.use('tenantService')
    const tenant = await tenantService.get(ctx.headers['tenant-id'] as string)

    if (tenant) {
      ctx.tenantApiSignatureResult = {
        tenant,
        isOperator: tenant.apiSecret === config.adminApiSecret
      }
    } else {
      ctx.throw(401, 'Unauthorized')
    }
  }
  return next()
}

// Tenant comes off the request ctx, so requests never share a tenant
export function createTenantedApolloContext(
  ctx: TenantedAppContext
): TenantedApolloContext {
  if (!ctx.tenantApiSignatureResult) {
    // Test env only: authenticatedTenantMiddleware already throws 401
    throw new GraphQLError('Unauthorized', {
      extensions: {
        code: GraphQLErrorCode.Unauthenticated
      }
    })
  }

  return {
    ...ctx.tenantApiSignatureResult,
    container: ctx.container,
    logger: ctx.logger
  }
}
