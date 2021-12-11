import {
  MutationResolvers,
  ResolversTypes,
  RevokeMandateMutationResponse,
  Mandate as SchemaMandate,
  MandateConnectionResolvers,
  AccountResolvers
} from '../generated/graphql'
import { isRevokeError, RevokeError } from '../../open_payments/mandate/errors'
import { Mandate } from '../../open_payments/mandate/model'
import { ApolloContext } from '../../app'

export const getAccountMandates: AccountResolvers<ApolloContext>['mandates'] = async (
  parent,
  args,
  ctx
): ResolversTypes['MandateConnection'] => {
  if (!parent.id) throw new Error('missing account id')
  const mandateService = await ctx.container.use('mandateService')
  const mandates = await mandateService.getAccountMandatesPage(parent.id, args)

  return {
    edges: mandates.map((mandate: Mandate) => ({
      cursor: mandate.id,
      node: mandateToGraphql(mandate)
    }))
  }
}

export const revokeMandate: MutationResolvers<ApolloContext>['revokeMandate'] = async (
  parent,
  args,
  ctx
): ResolversTypes['RevokeMandateMutationResponse'] => {
  const mandateService = await ctx.container.use('mandateService')

  return mandateService
    .revoke(args.mandateId)
    .then((mandateOrErr: Mandate | RevokeError) =>
      isRevokeError(mandateOrErr)
        ? errorToResponse[mandateOrErr]
        : {
            code: '200',
            message: '',
            success: true,
            mandate: mandateToGraphql(mandateOrErr)
          }
    )
    .catch((err: Error) => ({
      code: '500',
      success: false,
      message: err.message
    }))
}

export const getMandatePageInfo: MandateConnectionResolvers<ApolloContext>['pageInfo'] = async (
  parent,
  args,
  ctx
): ResolversTypes['PageInfo'] => {
  const logger = await ctx.container.use('logger')
  const mandateService = await ctx.container.use('mandateService')

  logger.info({ edges: parent.edges }, 'getPageInfo parent edges')

  const edges = parent.edges
  if (edges == null || typeof edges == 'undefined' || edges.length == 0)
    return {
      hasPreviousPage: false,
      hasNextPage: false
    }

  const firstEdge = edges[0].cursor
  const lastEdge = edges[edges.length - 1].cursor

  const firstMandate = await mandateService.get(edges[0].node.id)
  if (!firstMandate) throw new Error('mandate not found')

  let hasNextPageMandates, hasPreviousPageMandates
  try {
    hasNextPageMandates = await mandateService.getAccountMandatesPage(
      firstMandate.accountId,
      {
        after: lastEdge,
        first: 1
      }
    )
  } catch (e) {
    hasNextPageMandates = []
  }
  try {
    hasPreviousPageMandates = await mandateService.getAccountMandatesPage(
      firstMandate.accountId,
      {
        before: firstEdge,
        last: 1
      }
    )
  } catch (e) {
    hasPreviousPageMandates = []
  }

  return {
    endCursor: lastEdge,
    hasNextPage: hasNextPageMandates.length == 1,
    hasPreviousPage: hasPreviousPageMandates.length == 1,
    startCursor: firstEdge
  }
}

const errorToResponse: {
  [key in RevokeError]: RevokeMandateMutationResponse
} = {
  [RevokeError.AlreadyExpired]: {
    code: '409',
    message: 'Mandate already expired',
    success: false
  },
  [RevokeError.AlreadyRevoked]: {
    code: '409',
    message: 'Mandate already revoked',
    success: false
  },
  [RevokeError.UnknownMandate]: {
    code: '404',
    message: 'Unknown mandate',
    success: false
  }
}

function mandateToGraphql(mandate: Mandate): SchemaMandate {
  return {
    ...mandate,
    createdAt: mandate.createdAt.toISOString(),
    expiresAt: mandate.expiresAt?.toISOString(),
    startAt: mandate.startAt?.toISOString()
  }
}
