import {
  ResolversTypes,
  WalletAddressResolvers,
  MutationResolvers,
  IncomingPayment as SchemaIncomingPayment,
  QueryResolvers,
  IncomingPaymentResolvers
} from '../generated/graphql'
import { IncomingPayment } from '../../open_payments/payment/incoming/model'
import {
  isIncomingPaymentError,
  errorToCode,
  errorToMessage,
  IncomingPaymentError
} from '../../open_payments/payment/incoming/errors'
import { ForTenantIdContext, TenantedApolloContext } from '../../app'
import { getPageInfo } from '../../shared/pagination'
import { Pagination, SortOrder } from '../../shared/baseModel'
import { GraphQLError } from 'graphql'
import { GraphQLErrorCode } from '../errors'
import { tenantToGraphQl } from './tenant'

export const getIncomingPayment: QueryResolvers<TenantedApolloContext>['incomingPayment'] =
  async (parent, args, ctx): Promise<ResolversTypes['IncomingPayment']> => {
    const incomingPaymentService = await ctx.container.use(
      'incomingPaymentService'
    )
    const payment = await incomingPaymentService.get({
      id: args.id,
      tenantId: ctx.isOperator ? undefined : ctx.tenant.id
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

export const getWalletAddressIncomingPayments: WalletAddressResolvers<TenantedApolloContext>['incomingPayments'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['IncomingPaymentConnection']> => {
    if (!parent.id) {
      throw new GraphQLError('missing wallet address id', {
        extensions: {
          code: GraphQLErrorCode.BadUserInput
        }
      })
    }
    const incomingPaymentService = await ctx.container.use(
      'incomingPaymentService'
    )
    const { sortOrder, ...pagination } = args
    const order = sortOrder === 'ASC' ? SortOrder.Asc : SortOrder.Desc
    const incomingPayments = await incomingPaymentService.getWalletAddressPage({
      walletAddressId: parent.id,
      pagination,
      sortOrder: order,
      tenantId: ctx.isOperator ? undefined : ctx.tenant.id
    })
    const pageInfo = await getPageInfo({
      getPage: (pagination: Pagination, sortOrder?: SortOrder) =>
        incomingPaymentService.getWalletAddressPage({
          walletAddressId: parent.id as string,
          pagination,
          sortOrder,
          tenantId: ctx.tenant.id
        }),
      page: incomingPayments,
      sortOrder: order
    })

    return {
      pageInfo,
      edges: incomingPayments.map((incomingPayment: IncomingPayment) => {
        return {
          cursor: incomingPayment.id,
          node: paymentToGraphql(incomingPayment)
        }
      })
    }
  }
export const createIncomingPayment: MutationResolvers<ForTenantIdContext>['createIncomingPayment'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['IncomingPaymentResponse']> => {
    const incomingPaymentService = await ctx.container.use(
      'incomingPaymentService'
    )

    const tenantId = ctx.forTenantId
    if (!tenantId) {
      throw new Error('Missing tenant id to create incoming payment')
    }

    const incomingPaymentOrError = await incomingPaymentService.create({
      walletAddressId: args.input.walletAddressId,
      expiresAt: !args.input.expiresAt
        ? undefined
        : new Date(args.input.expiresAt),
      incomingAmount: args.input.incomingAmount,
      metadata: args.input.metadata,
      tenantId
    })
    if (isIncomingPaymentError(incomingPaymentOrError)) {
      throw new GraphQLError(errorToMessage[incomingPaymentOrError], {
        extensions: {
          code: errorToCode[incomingPaymentOrError]
        }
      })
    } else
      return {
        payment: paymentToGraphql(incomingPaymentOrError)
      }
  }

export const updateIncomingPayment: MutationResolvers<TenantedApolloContext>['updateIncomingPayment'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['IncomingPaymentResponse']> => {
    const incomingPaymentService = await ctx.container.use(
      'incomingPaymentService'
    )
    const incomingPaymentOrError = await incomingPaymentService.update({
      ...args.input,
      tenantId: ctx.tenant.id
    })
    if (isIncomingPaymentError(incomingPaymentOrError)) {
      throw new GraphQLError(errorToMessage[incomingPaymentOrError], {
        extensions: {
          code: errorToCode[incomingPaymentOrError]
        }
      })
    } else
      return {
        payment: paymentToGraphql(incomingPaymentOrError)
      }
  }

export const approveIncomingPayment: MutationResolvers<TenantedApolloContext>['approveIncomingPayment'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['ApproveIncomingPaymentResponse']> => {
    const incomingPaymentService = await ctx.container.use(
      'incomingPaymentService'
    )

    const incomingPaymentOrError = await incomingPaymentService.approve(
      args.input.id,
      ctx.tenant.id
    )

    if (isIncomingPaymentError(incomingPaymentOrError)) {
      throw new GraphQLError(errorToMessage[incomingPaymentOrError], {
        extensions: {
          code: errorToCode[incomingPaymentOrError]
        }
      })
    }

    return {
      payment: paymentToGraphql(incomingPaymentOrError)
    }
  }

export const cancelIncomingPayment: MutationResolvers<TenantedApolloContext>['cancelIncomingPayment'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['CancelIncomingPaymentResponse']> => {
    const incomingPaymentService = await ctx.container.use(
      'incomingPaymentService'
    )

    const incomingPaymentOrError = await incomingPaymentService.cancel(
      args.input.id,
      ctx.tenant.id
    )

    if (isIncomingPaymentError(incomingPaymentOrError)) {
      throw new GraphQLError(errorToMessage[incomingPaymentOrError], {
        extensions: {
          code: errorToCode[incomingPaymentOrError]
        }
      })
    }

    return {
      payment: paymentToGraphql(incomingPaymentOrError)
    }
  }

export const getIncomingPaymentTenant: IncomingPaymentResolvers<TenantedApolloContext>['tenant'] =
  async (parent, args, ctx): Promise<ResolversTypes['Tenant'] | null> => {
    if (!parent.id)
      throw new GraphQLError('"id" required in request to resolve "tenant".')
    const incomingPaymentService = await ctx.container.use(
      'incomingPaymentService'
    )
    const incomingPayment = await incomingPaymentService.get({ id: parent.id })
    if (!incomingPayment)
      throw new GraphQLError(
        errorToMessage[IncomingPaymentError.UnknownPayment],
        {
          extensions: {
            code: errorToCode[IncomingPaymentError.UnknownPayment]
          }
        }
      )

    const tenantService = await ctx.container.use('tenantService')
    const tenant = await tenantService.get(incomingPayment.tenantId)
    if (!tenant) return null
    return tenantToGraphQl(tenant)
  }

export function paymentToGraphql(
  payment: IncomingPayment
): SchemaIncomingPayment {
  return {
    id: payment.id,
    walletAddressId: payment.walletAddressId,
    client: payment.client,
    state: payment.state,
    expiresAt: payment.expiresAt.toISOString(),
    incomingAmount: payment.incomingAmount,
    receivedAmount: payment.receivedAmount,
    metadata: payment.metadata,
    createdAt: new Date(+payment.createdAt).toISOString()
  }
}
