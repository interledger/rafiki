import { quoteToGraphql } from './quote'
import {
  MutationResolvers,
  OutgoingPayment as SchemaOutgoingPayment,
  WalletAddressResolvers,
  QueryResolvers,
  ResolversTypes
} from '../generated/graphql'
import {
  isOutgoingPaymentError,
  errorToMessage,
  errorToCode
} from '../../open_payments/payment/outgoing/errors'
import { OutgoingPayment } from '../../open_payments/payment/outgoing/model'
import { ApolloContext } from '../../app'
import { getPageInfo } from '../../shared/pagination'
import { Pagination, SortOrder } from '../../shared/baseModel'
import { GraphQLError } from 'graphql'
import { GraphQLErrorCode } from '../errors'

export const getOutgoingPayment: QueryResolvers<ApolloContext>['outgoingPayment'] =
  async (parent, args, ctx): Promise<ResolversTypes['OutgoingPayment']> => {
    const outgoingPaymentService = await ctx.container.use(
      'outgoingPaymentService'
    )
    const payment = await outgoingPaymentService.get({
      id: args.id
    })
    if (!payment) {
      throw new GraphQLError('payment does not exist', {
        extensions: {
          code: GraphQLErrorCode.NotFound
        }
      })
    }
    return paymentToGraphql(payment)
  }

export const getOutgoingPayments: QueryResolvers<ApolloContext>['outgoingPayments'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['OutgoingPaymentConnection']> => {
    const outgoingPaymentService = await ctx.container.use(
      'outgoingPaymentService'
    )
    const { filter, sortOrder, ...pagination } = args
    const order = sortOrder === 'ASC' ? SortOrder.Asc : SortOrder.Desc
    const getPageFn = (pagination_: Pagination, sortOrder_?: SortOrder) =>
      outgoingPaymentService.getPage({
        pagination: pagination_,
        filter,
        sortOrder: sortOrder_
      })

    const outgoingPayments = await getPageFn(pagination, order)
    const pageInfo = await getPageInfo({
      getPage: (pagination_: Pagination, sortOrder_?: SortOrder) =>
        getPageFn(pagination_, sortOrder_),
      page: outgoingPayments,
      sortOrder: order
    })

    return {
      pageInfo,
      edges: outgoingPayments.map((outgoingPayment: OutgoingPayment) => ({
        cursor: outgoingPayment.id,
        node: paymentToGraphql(outgoingPayment)
      }))
    }
  }

export const cancelOutgoingPayment: MutationResolvers<ApolloContext>['cancelOutgoingPayment'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['OutgoingPaymentResponse']> => {
    const outgoingPaymentService = await ctx.container.use(
      'outgoingPaymentService'
    )

    const outgoingPaymentOrError = await outgoingPaymentService.cancel(
      args.input
    )

    if (isOutgoingPaymentError(outgoingPaymentOrError)) {
      throw new GraphQLError(errorToMessage[outgoingPaymentOrError], {
        extensions: {
          code: errorToCode[outgoingPaymentOrError]
        }
      })
    } else {
      return {
        payment: paymentToGraphql(outgoingPaymentOrError)
      }
    }
  }

export const createOutgoingPayment: MutationResolvers<ApolloContext>['createOutgoingPayment'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['OutgoingPaymentResponse']> => {
    const outgoingPaymentService = await ctx.container.use(
      'outgoingPaymentService'
    )
    const outgoingPaymentOrError = await outgoingPaymentService.create(
      args.input
    )
    const tel = await ctx.container.use('telemetryService')
    tel.incrementCounter('create_outgoing_payment_gql_total', 1, {
      description: 'Count of create outgoing payment gql requests'
    })

    if (isOutgoingPaymentError(outgoingPaymentOrError)) {
      throw new GraphQLError(errorToMessage[outgoingPaymentOrError], {
        extensions: {
          code: errorToCode[outgoingPaymentOrError]
        }
      })
    } else
      return {
        payment: paymentToGraphql(outgoingPaymentOrError)
      }
  }

export const createOutgoingPaymentFromIncomingPayment: MutationResolvers<ApolloContext>['createOutgoingPaymentFromIncomingPayment'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['OutgoingPaymentResponse']> => {
    const outgoingPaymentService = await ctx.container.use(
      'outgoingPaymentService'
    )

    const outgoingPaymentOrError = await outgoingPaymentService.create(
      args.input
    )

    if (isOutgoingPaymentError(outgoingPaymentOrError)) {
      throw new GraphQLError(errorToMessage[outgoingPaymentOrError], {
        extensions: {
          code: errorToCode[outgoingPaymentOrError]
        }
      })
    } else {
      return {
        payment: paymentToGraphql(outgoingPaymentOrError)
      }
    }
  }

export const getWalletAddressOutgoingPayments: WalletAddressResolvers<ApolloContext>['outgoingPayments'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['OutgoingPaymentConnection']> => {
    if (!parent.id) {
      throw new GraphQLError('missing wallet address id', {
        extensions: {
          code: GraphQLErrorCode.BadUserInput
        }
      })
    }
    const outgoingPaymentService = await ctx.container.use(
      'outgoingPaymentService'
    )
    const { sortOrder, ...pagination } = args
    const order = sortOrder === 'ASC' ? SortOrder.Asc : SortOrder.Desc
    const outgoingPayments = await outgoingPaymentService.getWalletAddressPage({
      walletAddressId: parent.id,
      pagination,
      sortOrder: order
    })
    const pageInfo = await getPageInfo({
      getPage: (pagination: Pagination, sortOrder?: SortOrder) =>
        outgoingPaymentService.getWalletAddressPage({
          walletAddressId: parent.id as string,
          pagination,
          sortOrder
        }),
      page: outgoingPayments,
      sortOrder: order
    })
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
): SchemaOutgoingPayment {
  return {
    id: payment.id,
    walletAddressId: payment.walletAddressId,
    client: payment.client,
    state: payment.state,
    error: payment.error,
    stateAttempts: payment.stateAttempts,
    receiver: payment.receiver,
    debitAmount: payment.debitAmount,
    sentAmount: payment.sentAmount,
    receiveAmount: payment.receiveAmount,
    metadata: payment.metadata,
    createdAt: new Date(+payment.createdAt).toISOString(),
    quote: quoteToGraphql(payment.quote),
    grantId: payment.grantId
  }
}
