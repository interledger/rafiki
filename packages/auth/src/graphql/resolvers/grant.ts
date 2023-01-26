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
      const {continueId, continueToken} = args.input
      if (!continueId || !continueToken) {
        return {
          code: '401',
          success: false,
          message: 'Grant Id or token is not provided'
        }
      }

      const grantService = await ctx.container.use('grantService')
      const grant = await grantService.getByContinue(continueId, continueToken)
      if (!grant) {
        return {
          code: '404',
          success: false,
          message: 'There is not grant with this parameters'
        }
      }

      const deletion = await grantService.deleteGrant(continueId)
      if (!deletion) {
        return {
          code: '404',
          success: false,
          message: 'Delete grant was not successful'
        }
      }

      return {
        code: '204',
        success: true,
        message: 'Grant revoked',
        grant: grantToGraphql(grant)
      }
    } catch (error) {
      ctx.logger.error(
        {
          options: args.input.continueId,
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
