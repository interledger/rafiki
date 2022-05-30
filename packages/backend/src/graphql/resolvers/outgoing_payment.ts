import { quoteToGraphql } from './quote'
import {
  MutationResolvers,
  OutgoingPayment as SchemaOutgoingPayment,
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
import { getPageInfo } from '../../shared/pagination'
import { Pagination } from '../../shared/baseModel'

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
  const pageInfo = await getPageInfo(
    (pagination: Pagination) =>
      outgoingPaymentService.getAccountPage(parent.id as string, pagination),
    outgoingPayments
  )
  return {
    pageInfo,
    edges: outgoingPayments.map((payment: OutgoingPayment) => ({
      cursor: payment.id,
      node: paymentToGraphql(payment)
    }))
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
