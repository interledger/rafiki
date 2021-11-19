import { isPaymentError, PaymentError } from '@interledger/pay'
import {
  MutationResolvers,
  OutgoingPayment as SchemaOutgoingPayment,
  OutgoingPaymentResolvers,
  OutgoingPaymentConnectionResolvers,
  PaymentState as SchemaPaymentState,
  PaymentPointerResolvers,
  PaymentType as SchemaPaymentType,
  QueryResolvers,
  ResolversTypes
} from '../generated/graphql'
import { OutgoingPayment } from '../../outgoing_payment/model'
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
  if (totalSent === undefined)
    throw new Error('account total sent does not exist')
  return {
    amountSent: totalSent
  }
}

const clientErrors: { [key in PaymentError]: boolean } = {
  InvalidPaymentPointer: true,
  InvalidCredentials: true,
  InvalidSlippage: false,
  UnknownSourceAsset: true,
  UnknownPaymentTarget: true,
  InvalidSourceAmount: true,
  InvalidDestinationAmount: true,
  UnenforceableDelivery: true,
  InvalidQuote: false,

  // QueryFailed can be either a client or server error: an invalid invoice URL, or failed query.
  QueryFailed: true,
  InvoiceAlreadyPaid: false,
  ConnectorError: false,
  EstablishmentFailed: false,
  UnknownDestinationAsset: false,
  DestinationAssetConflict: false,
  ExternalRateUnavailable: false,
  RateProbeFailed: false,
  InsufficientExchangeRate: false,
  IdleTimeout: false,
  ClosedByReceiver: false,
  IncompatibleReceiveMax: false,
  ReceiverProtocolViolation: false,
  MaxSafeEncryptionLimit: false
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
    .then((payment: OutgoingPayment) => ({
      code: '200',
      success: true,
      payment: paymentToGraphql(payment)
    }))
    .catch((err: Error | PaymentError) => ({
      code: isPaymentError(err) && clientErrors[err] ? '400' : '500',
      success: false,
      message: typeof err === 'string' ? err : err.message
    }))
}

export const requoteOutgoingPayment: MutationResolvers<ApolloContext>['requoteOutgoingPayment'] = async (
  parent,
  args,
  ctx
): ResolversTypes['OutgoingPaymentResponse'] => {
  const outgoingPaymentService = await ctx.container.use(
    'outgoingPaymentService'
  )
  return outgoingPaymentService
    .requote(args.paymentId)
    .then((payment: OutgoingPayment) => ({
      code: '200',
      success: true,
      payment: paymentToGraphql(payment)
    }))
    .catch((err: Error) => ({
      code: '500',
      success: false,
      message: err.message
    }))
}

export const approveOutgoingPayment: MutationResolvers<ApolloContext>['approveOutgoingPayment'] = async (
  parent,
  args,
  ctx
): ResolversTypes['OutgoingPaymentResponse'] => {
  const outgoingPaymentService = await ctx.container.use(
    'outgoingPaymentService'
  )
  return outgoingPaymentService
    .approve(args.paymentId)
    .then((payment: OutgoingPayment) => ({
      code: '200',
      success: true,
      payment: paymentToGraphql(payment)
    }))
    .catch((err: Error) => ({
      code: '500',
      success: false,
      message: err.message
    }))
}

export const cancelOutgoingPayment: MutationResolvers<ApolloContext>['cancelOutgoingPayment'] = async (
  parent,
  args,
  ctx
): ResolversTypes['OutgoingPaymentResponse'] => {
  const outgoingPaymentService = await ctx.container.use(
    'outgoingPaymentService'
  )
  return outgoingPaymentService
    .cancel(args.paymentId)
    .then((payment: OutgoingPayment) => ({
      code: '200',
      success: true,
      payment: paymentToGraphql(payment)
    }))
    .catch((err: Error) => ({
      code: '500',
      success: false,
      message: err.message
    }))
}

export const getPaymentPointerOutgoingPayments: PaymentPointerResolvers<ApolloContext>['outgoingPayments'] = async (
  parent,
  args,
  ctx
): ResolversTypes['OutgoingPaymentConnection'] => {
  if (!parent.id) throw new Error('missing account id')
  const outgoingPaymentService = await ctx.container.use(
    'outgoingPaymentService'
  )
  const outgoingPayments = await outgoingPaymentService.getPaymentPointerPage(
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
    hasNextPagePayments = await outgoingPaymentService.getPaymentPointerPage(
      firstPayment.paymentPointerId,
      {
        after: lastEdge,
        first: 1
      }
    )
  } catch (e) {
    hasNextPagePayments = []
  }
  try {
    hasPreviousPagePayments = await outgoingPaymentService.getPaymentPointerPage(
      firstPayment.paymentPointerId,
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

function paymentToGraphql(
  payment: OutgoingPayment
): Omit<SchemaOutgoingPayment, 'outcome' | 'account'> {
  return {
    id: payment.id,
    state: SchemaPaymentState[payment.state],
    error: payment.error ?? undefined,
    stateAttempts: payment.stateAttempts,
    intent: payment.intent,
    quote: payment.quote && {
      ...payment.quote,
      targetType: SchemaPaymentType[payment.quote.targetType],
      timestamp: payment.quote.timestamp.toISOString(),
      activationDeadline: payment.quote.activationDeadline.toISOString(),
      minExchangeRate: payment.quote.minExchangeRate.valueOf(),
      lowExchangeRateEstimate: payment.quote.lowExchangeRateEstimate.valueOf(),
      highExchangeRateEstimate: payment.quote.highExchangeRateEstimate.valueOf()
    },
    destinationAccount: payment.destinationAccount,
    createdAt: new Date(+payment.createdAt).toISOString()
  }
}
