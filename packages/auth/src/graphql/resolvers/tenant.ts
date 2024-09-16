import { GraphQLError } from 'graphql'
import { ApolloContext } from '../../app'
import {
  errorToCode,
  errorToMessage,
  isTenantError,
  TenantError
} from '../../tenants/errors'
import { MutationResolvers, ResolversTypes } from '../generated/graphql'

export const createTenant: MutationResolvers<ApolloContext>['createTenant'] =
  async (
    _,
    args,
    ctx
  ): Promise<ResolversTypes['CreateTenantMutationResponse']> => {
    const tenantService = await ctx.container.use('tenantService')

    const tenantOrError = await tenantService.create(args.input)

    if (isTenantError(tenantOrError)) {
      throw new GraphQLError(errorToMessage[tenantOrError], {
        extensions: {
          code: errorToCode[tenantOrError]
        }
      })
    }

    return { tenant: tenantOrError }
  }

export const deleteTenant: MutationResolvers<ApolloContext>['deleteTenant'] =
  async (
    _,
    args,
    ctx
  ): Promise<ResolversTypes['DeleteTenantMutationResponse']> => {
    const tenantService = await ctx.container.use('tenantService')
    const tenant = await tenantService.delete(args.input.tenantId)
    if (!tenant) {
      throw new GraphQLError(errorToMessage[TenantError.UnknownTenant], {
        extensions: {
          code: errorToCode[TenantError.UnknownTenant]
        }
      })
    }
    return {
      success: true
    }
  }
