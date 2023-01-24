import {
  ResolversTypes,
  MutationResolvers,
  Grant as SchemaGrant
} from '../generated/graphql'
import { ApolloContext } from '../../app'
import { Grant } from '../../grant/model'

export const revokeGrant: MutationResolvers<ApolloContext>['revokeGrant'] =
  async (
    _,
    args,
    ctx
  ): Promise<ResolversTypes['RevokeGrantMutationResponse']> => {
    try {
      const grantService = await ctx.container.use('grantService')
      const grant = await grantService.rejectGrant(args.input.id)
      if (!grant) {
        return {
          code: '404',
          success: false,
          message: 'Grant id not found'
        }
      }

      return {
        code: '200',
        success: true,
        message: 'Grant revoked',
        grant: grantToGraphql(grant)
      }
    } catch (error) {
      ctx.logger.error(
        {
          options: args.input.id,
          error
        },
        'error revoking grant'
      )

      return {
        code: '500',
        message: 'Error trying to revoke grant',
        success: false
      }
    }
  }

export const grantToGraphql = (grant: Grant): SchemaGrant => ({
  id: grant.id,
  state: grant.state,
  createdAt: grant.createdAt.toISOString()
})
