import {
  ResolversTypes,
  WalletAddressResolvers,
  MutationResolvers,
  IncomingPayment as SchemaIncomingPayment,
  QueryResolvers,
  IncomingPaymentFilter,
  IncomingPaymentResolvers
} from '../generated/graphql'
import {
  IncomingPayment,
  IncomingPaymentState
} from '../../open_payments/payment/incoming/model'
import { IncomingPaymentInitiationReason } from '../../open_payments/payment/incoming/types'
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
import { IAppConfig } from '../../config/app'
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
    const config = await ctx.container.use('config')
    return paymentToGraphql(payment, config)
  }

export const getIncomingPayments: QueryResolvers<TenantedApolloContext>['incomingPayments'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['IncomingPaymentConnection']> => {
    const incomingPaymentService = await ctx.container.use(
      'incomingPaymentService'
    )
    const { tenantId, filter, sortOrder, ...pagination } = args
    const order = sortOrder === 'ASC' ? SortOrder.Asc : SortOrder.Desc
    const getPageFn = (
      pagination_: Pagination,
      sortOrder_?: SortOrder,
      filter_?: IncomingPaymentFilter
    ) =>
      incomingPaymentService.getPage({
        tenantId: ctx.isOperator ? tenantId : ctx.tenant.id,
        pagination: pagination_,
        filter: filter_,
        sortOrder: sortOrder_
      })
    const incomingPayments = await getPageFn(pagination, order, filter)
    const pageInfo = await getPageInfo({
      getPage: (
        pagination_: Pagination,
        sortOrder_?: SortOrder,
        filter_?: IncomingPaymentFilter
      ) => getPageFn(pagination_, sortOrder_, filter_),
      page: incomingPayments,
      sortOrder: order
    })

    const config = await ctx.container.use('config')

    return {
      pageInfo,
      edges: incomingPayments.map((incomingPayment: IncomingPayment) => ({
        cursor: incomingPayment.id,
        node: paymentToGraphql(incomingPayment, config)
      }))
    }
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
    const { sortOrder, filter, ...pagination } = args
    const order = sortOrder === 'ASC' ? SortOrder.Asc : SortOrder.Desc
    const incomingPayments = await incomingPaymentService.getPage({
      walletAddressId: parent.id,
      pagination,
      sortOrder: order,
      tenantId: ctx.isOperator ? undefined : ctx.tenant.id,
      filter
    })
    const pageInfo = await getPageInfo({
      getPage: (pagination: Pagination, sortOrder?: SortOrder) =>
        incomingPaymentService.getPage({
          walletAddressId: parent.id as string,
          pagination,
          sortOrder,
          tenantId: ctx.tenant.id,
          filter
        }),
      page: incomingPayments,
      sortOrder: order
    })

    const config = await ctx.container.use('config')
    return {
      pageInfo,
      edges: incomingPayments.map((incomingPayment: IncomingPayment) => {
        return {
          cursor: incomingPayment.id,
          node: paymentToGraphql(incomingPayment, config)
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

    if (!ctx.isOperator && args.input.isCardPayment) {
      ctx.logger.warn(
        { input: args.input, tenant: ctx.tenant },
        'non-operator cannot create card payment'
      )
    }

    const incomingPaymentOrError = await incomingPaymentService.create({
      walletAddressId: args.input.walletAddressId,
      expiresAt: !args.input.expiresAt
        ? undefined
        : new Date(args.input.expiresAt),
      incomingAmount: args.input.incomingAmount,
      metadata: args.input.metadata,
      tenantId,
      initiationReason:
        ctx.isOperator && args.input.isCardPayment
          ? IncomingPaymentInitiationReason.Card
          : IncomingPaymentInitiationReason.Admin,
      senderWalletAddress: args.input.senderWalletAddress
    })
    const config = await ctx.container.use('config')
    if (isIncomingPaymentError(incomingPaymentOrError)) {
      throw new GraphQLError(errorToMessage[incomingPaymentOrError], {
        extensions: {
          code: errorToCode[incomingPaymentOrError]
        }
      })
    } else
      return {
        payment: paymentToGraphql(incomingPaymentOrError, config)
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
    const config = await ctx.container.use('config')
    if (isIncomingPaymentError(incomingPaymentOrError)) {
      throw new GraphQLError(errorToMessage[incomingPaymentOrError], {
        extensions: {
          code: errorToCode[incomingPaymentOrError]
        }
      })
    } else
      return {
        payment: paymentToGraphql(incomingPaymentOrError, config)
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

    const config = await ctx.container.use('config')
    return {
      payment: paymentToGraphql(incomingPaymentOrError, config)
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

    const config = await ctx.container.use('config')
    return {
      payment: paymentToGraphql(incomingPaymentOrError, config)
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

const PARTIAL_PAYMENT_DECISION_PREFIX = 'partial_payment_decision'

export const confirmPartialIncomingPayment: MutationResolvers<TenantedApolloContext>['confirmPartialIncomingPayment'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['ConfirmPartialIncomingPaymentResponse']> => {
    const { input } = args
    await canHandlePartialIncomingPayment(ctx, input.incomingPaymentId)

    const redis = await ctx.container.use('redis')
    const cacheKey = `${PARTIAL_PAYMENT_DECISION_PREFIX}:${input.incomingPaymentId}:${input.partialIncomingPaymentId}`
    try {
      await redis.set(cacheKey, JSON.stringify({ success: true }))
      return { success: true }
    } catch (e) {
      const logger = await ctx.container.use('logger')
      logger.error(
        {
          e,
          incomingPaymentId: input.incomingPaymentId,
          partialPaymentId: input.partialIncomingPaymentId
        },
        'decision set failed'
      )
      return { success: false }
    }
  }

export const rejectPartialIncomingPayment: MutationResolvers<TenantedApolloContext>['rejectPartialIncomingPayment'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['RejectPartialIncomingPaymentResponse']> => {
    const { input } = args
    await canHandlePartialIncomingPayment(ctx, input.incomingPaymentId)

    const redis = await ctx.container.use('redis')
    const cacheKey = `partial_payment_decision:${input.incomingPaymentId}:${input.partialIncomingPaymentId}`
    try {
      await redis.set(cacheKey, JSON.stringify({ success: false }))
      return { success: true }
    } catch (e) {
      const logger = await ctx.container.use('logger')
      logger.error(
        {
          e,
          incomingPaymentId: input.incomingPaymentId,
          partialPaymentId: input.partialIncomingPaymentId
        },
        'decision set failed'
      )
      return { success: false }
    }
  }

async function canHandlePartialIncomingPayment(
  ctx: TenantedApolloContext,
  id: string
): Promise<void> {
  const incomingPaymentService = await ctx.container.use(
    'incomingPaymentService'
  )
  let options: {
    id: string
    tenantId?: string
  }

  if (!ctx.isOperator) {
    options = {
      id,
      tenantId: ctx.tenant.id
    }
  } else options = { id }

  const incomingPayment = await incomingPaymentService.get(options)
  if (!incomingPayment)
    throw new GraphQLError(
      errorToMessage[IncomingPaymentError.UnknownPayment],
      {
        extensions: {
          code: errorToCode[IncomingPaymentError.UnknownPayment]
        }
      }
    )

  if (
    [IncomingPaymentState.Completed, IncomingPaymentState.Expired].includes(
      incomingPayment.state
    )
  )
    throw new GraphQLError(errorToMessage[IncomingPaymentError.InvalidState], {
      extensions: {
        code: errorToCode[IncomingPaymentError.InvalidState]
      }
    })
  return
}

export function paymentToGraphql(
  payment: IncomingPayment,
  config: IAppConfig
): SchemaIncomingPayment {
  return {
    id: payment.id,
    url: payment.getUrl(config.openPaymentsUrl),
    walletAddressId: payment.walletAddressId,
    client: payment.client,
    state: payment.state,
    expiresAt: payment.expiresAt.toISOString(),
    incomingAmount: payment.incomingAmount,
    receivedAmount: payment.receivedAmount,
    metadata: payment.metadata,
    createdAt: new Date(+payment.createdAt).toISOString(),
    senderWalletAddress: payment.senderWalletAddress
  }
}
