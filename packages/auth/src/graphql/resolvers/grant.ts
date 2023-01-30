import {
  ResolversTypes,
  MutationResolvers,
  Grant as SchemaGrant,
  Access as SchemaAccess,
  QueryResolvers
} from '../generated/graphql'
import { ApolloContext } from '../../app'
import { Grant } from '../../grant/model'
import { Pagination } from '../../shared/baseModel'
import { getPageInfo } from '../../shared/pagination'
import { Access } from '../../access/model'

export const getGrants: QueryResolvers<ApolloContext>['grants'] = async (
  _,
  args,
  ctx
): Promise<ResolversTypes['GrantsConnection']> => {
  const grantService = await ctx.container.use('grantService')
  const grants = await grantService.getPage(args)

  const pageInfo = await getPageInfo(
    (pagination: Pagination) => grantService.getPage(pagination),
    grants
  )

  return {
    pageInfo,
    edges: grants.map((grant: Grant) => ({
      cursor: grant.id,
      node: grantToGraphql(grant)
    }))
  }
}

export const revokeGrant: MutationResolvers<ApolloContext>['revokeGrant'] =
  async (
    _,
    args,
    ctx
  ): Promise<ResolversTypes['RevokeGrantMutationResponse']> => {
    try {
      const { grantId } = args.input
      if (!grantId) {
        return {
          code: '401',
          success: false,
          message: 'Grant Id is not provided'
        }
      }

      const grantService = await ctx.container.use('grantService')
      const deletion = await grantService.deleteGrantById(grantId)
      if (!deletion) {
        return {
          code: '404',
          success: false,
          message: 'Delete grant was not successful'
        }
      }

      return {
        code: '200',
        success: true,
        message: 'Grant revoked'
      }
    } catch (error) {
      ctx.logger.error(
        {
          options: args.input.grantId,
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
  identifier: grant.identifier,
  client: grant.client,
  access: grant.access?.map((item) => accessToGraphql(item)),
  state: grant.state,
  createdAt: grant.createdAt.toISOString()
})

export const accessToGraphql = (access: Access): SchemaAccess => ({
  id: access.id,
  grantId: access.grantId,
  identifier: access.identifier,
  createdAt: access.createdAt.toISOString()
})
