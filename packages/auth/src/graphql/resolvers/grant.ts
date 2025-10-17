import { GraphQLError } from 'graphql'

import {
  ResolversTypes,
  MutationResolvers,
  Grant as SchemaGrant,
  Access as SchemaAccess,
  SubjectItem as SchemaSubjectItem,
  QueryResolvers
} from '../generated/graphql'
import { TenantedApolloContext } from '../../app'
import { Grant } from '../../grant/model'
import { Pagination, SortOrder } from '../../shared/baseModel'
import { getPageInfo } from '../../shared/pagination'
import { Access } from '../../access/model'
import { GraphQLErrorCode } from '../errors'
import { Subject } from '../../subject/model'

export const getGrants: QueryResolvers<TenantedApolloContext>['grants'] =
  async (_, args, ctx): Promise<ResolversTypes['GrantsConnection']> => {
    const grantService = await ctx.container.use('grantService')
    const { filter, sortOrder, tenantId, ...pagination } = args

    const getPageFn = (pagination_: Pagination, sortOrder_?: SortOrder) =>
      grantService.getPage(
        pagination_,
        filter,
        sortOrder_,
        ctx.isOperator ? tenantId : ctx.tenant.id
      )

    const grants = await getPageFn(pagination, sortOrder)

    const pageInfo = await getPageInfo(
      (pagination_: Pagination, sortOrder_?: SortOrder) =>
        getPageFn(pagination_, sortOrder_),
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

export const getGrantById: QueryResolvers<TenantedApolloContext>['grant'] =
  async (_, args, ctx): Promise<ResolversTypes['Grant']> => {
    const grantService = await ctx.container.use('grantService')
    const grant = await grantService.getByIdWithAccessAndSubject(
      args.id,
      ctx.isOperator ? undefined : ctx.tenant.id
    )

    if (!grant) {
      throw new GraphQLError('No grant', {
        extensions: {
          code: GraphQLErrorCode.NotFound
        }
      })
    }

    return grantToGraphql(grant)
  }

export const revokeGrant: MutationResolvers<TenantedApolloContext>['revokeGrant'] =
  async (
    _,
    args,
    ctx
  ): Promise<ResolversTypes['RevokeGrantMutationResponse']> => {
    const { grantId } = args.input
    if (!grantId) {
      throw new GraphQLError('Grant id is not provided', {
        extensions: {
          code: GraphQLErrorCode.Forbidden
        }
      })
    }

    const grantService = await ctx.container.use('grantService')
    const revoked = await grantService.revokeGrant(
      grantId,
      ctx.isOperator ? undefined : ctx.tenant.id
    )
    if (!revoked) {
      throw new GraphQLError('Revoke grant was not successful', {
        extensions: {
          code: GraphQLErrorCode.NotFound
        }
      })
    }

    return {
      id: grantId
    }
  }

export const grantToGraphql = (grant: Grant): SchemaGrant => ({
  id: grant.id,
  client: grant.client,
  access: grant.access?.map((item) => accessToGraphql(item)) || [],
  subject: grant.subjects
    ? {
        sub_ids: grant.subjects?.map((item) => subjectToGraphql(item)) || []
      }
    : undefined,
  state: grant.state,
  finalizationReason: grant.finalizationReason,
  createdAt: grant.createdAt.toISOString(),
  tenantId: grant.tenantId
})

export const accessToGraphql = (access: Access): SchemaAccess => ({
  id: access.id,
  actions: access.actions,
  type: access.type,
  identifier: access.identifier,
  createdAt: access.createdAt.toISOString(),
  limits: access.limits
})

export const subjectToGraphql = (subject: Subject): SchemaSubjectItem => ({
  id: subject.id,
  subId: subject.subId,
  subIdFormat: subject.subIdFormat,
  createdAt: subject.createdAt.toISOString()
})
