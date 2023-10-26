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
  const { filter, ...pagination } = args
  const grants = await grantService.getPage(pagination, filter)
  const pageInfo = await getPageInfo(
    (pagination: Pagination) => grantService.getPage(pagination, filter),
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

export const getGrantById: QueryResolvers<ApolloContext>['grant'] = async (
  _,
  args,
  ctx
): Promise<ResolversTypes['Grant']> => {
  const grantService = await ctx.container.use('grantService')
  const grant = await grantService.getByIdWithAccess(args.id)

  if (!grant) {
    throw new Error('No grant')
  }

  return grantToGraphql(grant)
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
      const revoked = await grantService.revokeGrant(grantId)
      if (!revoked) {
        return {
          code: '404',
          success: false,
          message: 'Revoke grant was not successful'
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
  client: grant.client,
  access: grant.access?.map((item) => accessToGraphql(item)),
  state: grant.state,
  finalizationReason: grant.finalizationReason,
  createdAt: grant.createdAt.toISOString()
})

export const accessToGraphql = (access: Access): SchemaAccess => ({
  id: access.id,
  actions: access.actions,
  type: access.type,
  identifier: access.identifier,
  createdAt: access.createdAt.toISOString(),
  limits: access.limits
})
