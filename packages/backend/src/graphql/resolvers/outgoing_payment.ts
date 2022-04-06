import {
  MutationResolvers,
  OutgoingPayment as SchemaOutgoingPayment,
  OutgoingPaymentResolvers,
  OutgoingPaymentConnectionResolvers,
  AccountResolvers,
  PaymentType as SchemaPaymentType,
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
): ResolversTypes['OutgoingPayment'] => {
  const outgoingPaymentService = await ctx.container.use(
    'outgoingPaymentService'
  )
  const payment = await outgoingPaymentService.get(args.id)
  if (!payment) throw new Error('payment does not exist')
  return paymentToGraphql(payment)
}

export const getOutcome: OutgoingPaymentResolvers<ApolloContext>['outcome'] = async (
  parent,
  args,
  ctx
): ResolversTypes['OutgoingPaymentOutcome'] => {
  if (!parent.id) throw new Error('missing id')
  const outgoingPaymentService = await ctx.container.use(
    'outgoingPaymentService'
  )
  const payment = await outgoingPaymentService.get(parent.id)
  if (!payment) throw new Error('payment does not exist')

  const accountingService = await ctx.container.use('accountingService')
  const totalSent = await accountingService.getTotalSent(payment.id)
  if (totalSent === undefined) throw new Error('payment account does not exist')
  return {
    amountSent: totalSent
  }
}

export const createOutgoingPayment: MutationResolvers<ApolloContext>['createOutgoingPayment'] = async (
  parent,
  args,
  ctx
): ResolversTypes['OutgoingPaymentResponse'] => {
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
): ResolversTypes['OutgoingPaymentConnection'] => {
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
): ResolversTypes['PageInfo'] => {
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
): Omit<SchemaOutgoingPayment, 'outcome' | 'account'> {
  return {
    id: payment.id,
    accountId: payment.accountId,
    state: payment.state,
    error: payment.error ?? undefined,
    stateAttempts: payment.stateAttempts,
    receivingAccount: payment.receivingAccount,
    receivingPayment: payment.receivingPayment,
    sendAmount: payment.sendAmount ?? undefined,
    receiveAmount: payment.receiveAmount ?? undefined,
    description: payment.description,
    externalRef: payment.externalRef,
    quote: payment.quote
      ? {
          ...payment.quote,
          targetType: SchemaPaymentType[payment.quote.targetType],
          timestamp: payment.quote.timestamp.toISOString(),
          minExchangeRate: payment.quote.minExchangeRate.valueOf(),
          lowExchangeRateEstimate: payment.quote.lowExchangeRateEstimate.valueOf(),
          highExchangeRateEstimate: payment.quote.highExchangeRateEstimate.valueOf()
        }
      : undefined,
    createdAt: new Date(+payment.createdAt).toISOString()
  }
}
