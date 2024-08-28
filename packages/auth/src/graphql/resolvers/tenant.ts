import { ApolloContext } from '../../app'
import { TenantError } from '../../tenants/errors'
import { MutationResolvers, ResolversTypes } from '../generated/graphql'

export const createTenant: MutationResolvers<ApolloContext>['createTenant'] =
  async (
    _,
    args,
    ctx
  ): Promise<ResolversTypes['CreateTenantMutationResponse']> => {
    return TenantError.UnknownError
  }
