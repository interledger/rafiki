import {
  ResolversTypes,
  IncomingPaymentConnectionResolvers,
  AccountResolvers
} from '../generated/graphql'
import { IncomingPayment } from '../../open_payments/incoming/model'
import { ApolloContext } from '../../app'

export const getAccountIncomingPayments: AccountResolvers<ApolloContext>['incomingPayments'] = async (
  parent,
  args,
  ctx
): ResolversTypes['IncomingPaymentConnection'] => {
  if (!parent.id) throw new Error('missing account id')
  const incomingPaymentService = await ctx.container.use(
    'incomingPaymentService'
  )
  const incomingPayments = await incomingPaymentService.getAccountIncomingPaymentsPage(
    parent.id,
    args
  )

  return {
    edges: incomingPayments.map((incomingPayment: IncomingPayment) => ({
      cursor: incomingPayment.id,
      node: {
        ...incomingPayment,
        expiresAt: incomingPayment.expiresAt.toISOString(),
        createdAt: incomingPayment.createdAt?.toISOString()
      }
    }))
  }
}

export const getPageInfo: IncomingPaymentConnectionResolvers<ApolloContext>['pageInfo'] = async (
  parent,
  args,
  ctx
): ResolversTypes['PageInfo'] => {
  const logger = await ctx.container.use('logger')
  const incomingPaymentService = await ctx.container.use(
    'incomingPaymentService'
  )

  logger.info({ edges: parent.edges }, 'getPageInfo parent edges')

  const edges = parent.edges
  if (edges == null || typeof edges == 'undefined' || edges.length == 0)
    return {
      hasPreviousPage: false,
      hasNextPage: false
    }

  const firstEdge = edges[0].cursor
  const lastEdge = edges[edges.length - 1].cursor

  const firstIncomingPayment = await incomingPaymentService.get(
    edges[0].node.id
  )
  if (!firstIncomingPayment) throw new Error('incomingPayment not found')

  let hasNextPageIncomingPayments, hasPreviousPageIncomingPayments
  try {
    hasNextPageIncomingPayments = await incomingPaymentService.getAccountIncomingPaymentsPage(
      firstIncomingPayment.accountId,
      {
        after: lastEdge,
        first: 1
      }
    )
  } catch (e) {
    hasNextPageIncomingPayments = []
  }
  try {
    hasPreviousPageIncomingPayments = await incomingPaymentService.getAccountIncomingPaymentsPage(
      firstIncomingPayment.accountId,
      {
        before: firstEdge,
        last: 1
      }
    )
  } catch (e) {
    hasPreviousPageIncomingPayments = []
  }

  return {
    endCursor: lastEdge,
    hasNextPage: hasNextPageIncomingPayments.length == 1,
    hasPreviousPage: hasPreviousPageIncomingPayments.length == 1,
    startCursor: firstEdge
  }
}
