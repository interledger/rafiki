import {
  ResolversTypes,
  IncomingPaymentConnectionResolvers,
  AccountResolvers
} from '../generated/graphql'
import { IncomingPayment } from '../../open_payments/payment/incoming/model'
import { ApolloContext } from '../../app'
import { Amount } from '../../open_payments/payment/amount'
import { isIncomingPaymentError } from '../../open_payments/payment/incoming/errors'

export const getAccountIncomingPayments: AccountResolvers<ApolloContext>['incomingPayments'] = async (
  parent,
  args,
  ctx
): Promise<ResolversTypes['IncomingPaymentConnection']> => {
  if (!parent.id) throw new Error('missing account id')
  const incomingPaymentService = await ctx.container.use(
    'incomingPaymentService'
  )
  const incomingPayments = await incomingPaymentService.getAccountIncomingPaymentsPage(
    parent.id,
    args
  )

  return {
    edges: incomingPayments.map((incomingPayment: IncomingPayment) => {
      if (incomingPayment.receivedAmount) {
        return {
          cursor: incomingPayment.id,
          node: {
            ...incomingPayment,
            receivedAmount: incomingPayment.receivedAmount as Amount,
            expiresAt: incomingPayment.expiresAt.toISOString(),
            createdAt: incomingPayment.createdAt?.toISOString()
          }
        }
      } else {
        throw new Error('payment account does not exist')
      }
    })
  }
}

export const getPageInfo: IncomingPaymentConnectionResolvers<ApolloContext>['pageInfo'] = async (
  parent,
  args,
  ctx
): Promise<ResolversTypes['PageInfo']> => {
  const logger = await ctx.container.use('logger')
  const incomingPaymentService = await ctx.container.use(
    'incomingPaymentService'
  )

  logger.info({ edges: parent.edges }, 'getPageInfo parent edges')

  const edges = parent.edges
  if (
    edges == null ||
    typeof edges == 'undefined' ||
    edges.length == 0 ||
    !edges[0].node
  )
    return {
      hasPreviousPage: false,
      hasNextPage: false
    }

  const firstEdge = edges[0].cursor
  const lastEdge = edges[edges.length - 1].cursor

  const firstIncomingPayment = await incomingPaymentService.get(
    edges[0].node.id
  )
  if (isIncomingPaymentError(firstIncomingPayment))
    throw new Error('incomingPayment not found')

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
