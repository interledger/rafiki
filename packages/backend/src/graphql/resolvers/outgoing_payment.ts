import { quoteToGraphql } from './quote'
import {
  MutationResolvers,
  OutgoingPayment as SchemaOutgoingPayment,
  OutgoingPaymentConnectionResolvers,
  AccountResolvers,
  QueryResolvers,
  ResolversTypes
} from '../generated/graphql'
import {
  OutgoingPaymentError,
  isOutgoingPaymentError,
  errorToCode,
  errorToMessage
} from '../../open_payments/payment/outgoing/errors'
import { OutgoingPayment } from '../../open_payments/payment/outgoing/model'
import { ApolloContext } from '../../app'

export const getOutgoingPayment: QueryResolvers<ApolloContext>['outgoingPayment'] = async (
  parent,
  args,
  ctx
): Promise<ResolversTypes['OutgoingPayment']> => {
  const outgoingPaymentService = await ctx.container.use(
    'outgoingPaymentService'
  )
  const payment = await outgoingPaymentService.get(args.id)
  if (!payment) throw new Error('payment does not exist')
  return paymentToGraphql(payment)
}

export const createOutgoingPayment: MutationResolvers<ApolloContext>['createOutgoingPayment'] = async (
  parent,
  args,
  ctx
): Promise<ResolversTypes['OutgoingPaymentResponse']> => {
  const outgoingPaymentService = await ctx.container.use(
    'outgoingPaymentService'
  )
  return outgoingPaymentService
    .create(args.input)
    .then((paymentOrErr: OutgoingPayment | OutgoingPaymentError) =>
      isOutgoingPaymentError(paymentOrErr)
        ? {
            code: errorToCode[paymentOrErr].toString(),
            success: false,
            message: errorToMessage[paymentOrErr]
          }
        : {
            code: '200',
            success: true,
            payment: paymentToGraphql(paymentOrErr)
          }
    )
    .catch(() => ({
      code: '500',
      success: false,
      message: 'Error trying to create outgoing payment'
    }))
}

export const getAccountOutgoingPayments: AccountResolvers<ApolloContext>['outgoingPayments'] = async (
  parent,
  args,
  ctx
): Promise<ResolversTypes['OutgoingPaymentConnection']> => {
  if (!parent.id) throw new Error('missing account id')
  const outgoingPaymentService = await ctx.container.use(
    'outgoingPaymentService'
  )
  const outgoingPayments = await outgoingPaymentService.getAccountPage(
    parent.id,
    args
  )
  return {
    edges: outgoingPayments.map((payment: OutgoingPayment) => ({
      cursor: payment.id,
      node: paymentToGraphql(payment)
    }))
  }
}

export const getOutgoingPaymentPageInfo: OutgoingPaymentConnectionResolvers<ApolloContext>['pageInfo'] = async (
  parent,
  args,
  ctx
): Promise<ResolversTypes['PageInfo']> => {
  const logger = await ctx.container.use('logger')
  const outgoingPaymentService = await ctx.container.use(
    'outgoingPaymentService'
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

  const firstPayment = await outgoingPaymentService.get(edges[0].node.id)
  if (!firstPayment) throw 'payment does not exist'

  let hasNextPagePayments, hasPreviousPagePayments
  try {
    hasNextPagePayments = await outgoingPaymentService.getAccountPage(
      firstPayment.accountId,
      {
        after: lastEdge,
        first: 1
      }
    )
  } catch (e) {
    hasNextPagePayments = []
  }
  try {
    hasPreviousPagePayments = await outgoingPaymentService.getAccountPage(
      firstPayment.accountId,
      {
        before: firstEdge,
        last: 1
      }
    )
  } catch (e) {
    hasPreviousPagePayments = []
  }

  return {
    endCursor: lastEdge,
    hasNextPage: hasNextPagePayments.length == 1,
    hasPreviousPage: hasPreviousPagePayments.length == 1,
    startCursor: firstEdge
  }
}

export function paymentToGraphql(
  payment: OutgoingPayment
): Omit<SchemaOutgoingPayment, 'outcome'> {
  return {
    id: payment.id,
    accountId: payment.accountId,
    state: payment.state,
    error: payment.error ?? undefined,
    stateAttempts: payment.stateAttempts,
    receivingPayment: payment.receivingPayment,
    sendAmount: payment.sendAmount,
    sentAmount: payment.sentAmount,
    receiveAmount: payment.receiveAmount,
    description: payment.description,
    externalRef: payment.externalRef,
    createdAt: new Date(+payment.createdAt).toISOString(),
    quote: quoteToGraphql(payment.quote)
  }
}
