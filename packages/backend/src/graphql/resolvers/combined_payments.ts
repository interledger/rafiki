import {
  ResolversTypes,
  QueryResolvers,
  Payment as SchemaPayment,
  PaymentResolvers,
  PaymentType
} from '../generated/graphql'
import { TenantedApolloContext } from '../../app'
import { getPageInfo } from '../../shared/pagination'
import { Pagination, SortOrder } from '../../shared/baseModel'
import { CombinedPayment } from '../../open_payments/payment/combined/model'
import { tenantToGraphQl } from './tenant'
import { IncomingPayment } from '../../open_payments/payment/incoming/model'
import { OutgoingPayment } from '../../open_payments/payment/outgoing/model'
import { GraphQLError } from 'graphql'
import {
  errorToCode as incomingPaymentErrorToCode,
  errorToMessage as incomingPaymentErrorToMessage,
  IncomingPaymentError
} from '../../open_payments/payment/incoming/errors'
import {
  errorToCode as outgoingPaymentErrorToCode,
  errorToMessage as outgoingPaymentErrorToMessage,
  OutgoingPaymentError
} from '../../open_payments/payment/outgoing/errors'

export const getCombinedPayments: QueryResolvers<TenantedApolloContext>['payments'] =
  async (parent, args, ctx): Promise<ResolversTypes['PaymentConnection']> => {
    const combinedPaymentService = await ctx.container.use(
      'combinedPaymentService'
    )
    const { filter, sortOrder, tenantId, ...pagination } = args
    const order = sortOrder === 'ASC' ? SortOrder.Asc : SortOrder.Desc

    const getPageFn = (pagination_: Pagination, sortOrder_?: SortOrder) =>
      combinedPaymentService.getPage({
        pagination: pagination_,
        filter,
        sortOrder: sortOrder_,
        tenantId: ctx.isOperator ? tenantId : ctx.tenant.id
      })

    const payments = await getPageFn(pagination, order)
    const pageInfo = await getPageInfo({
      getPage: (pagination_: Pagination, sortOrder_?: SortOrder) =>
        getPageFn(pagination_, sortOrder_),
      page: payments,
      sortOrder: order
    })

    return {
      pageInfo,
      edges: payments.map((payment: CombinedPayment) => {
        return {
          cursor: payment.id,
          node: paymentToGraphql(payment)
        }
      })
    }
  }

export const getPaymentTenant: PaymentResolvers<TenantedApolloContext>['tenant'] =
  async (parent, args, ctx): Promise<ResolversTypes['Tenant'] | null> => {
    if (!parent.id || !parent.type)
      throw new GraphQLError(
        '"id" and "type" fields required in request to resolve "tenant".'
      )

    let payment: IncomingPayment | OutgoingPayment
    if (parent.type === PaymentType.Incoming) {
      const incomingPaymentService = await ctx.container.use(
        'incomingPaymentService'
      )
      const incomingPayment = await incomingPaymentService.get({
        id: parent.id
      })
      if (!incomingPayment)
        throw new GraphQLError(
          incomingPaymentErrorToMessage[IncomingPaymentError.UnknownPayment],
          {
            extensions: {
              code: incomingPaymentErrorToCode[
                IncomingPaymentError.UnknownPayment
              ]
            }
          }
        )
      payment = incomingPayment
    } else {
      const outgoingPaymentService = await ctx.container.use(
        'outgoingPaymentService'
      )
      const outgoingPayment = await outgoingPaymentService.get({
        id: parent.id
      })
      if (!outgoingPayment)
        throw new GraphQLError(
          outgoingPaymentErrorToMessage[OutgoingPaymentError.UnknownPayment],
          {
            extensions: {
              code: outgoingPaymentErrorToCode[
                OutgoingPaymentError.UnknownPayment
              ]
            }
          }
        )
      payment = outgoingPayment
    }

    const tenantService = await ctx.container.use('tenantService')
    const tenant = await tenantService.get(payment.tenantId)
    if (!tenant) return null
    return tenantToGraphQl(tenant)
  }

function paymentToGraphql(payment: CombinedPayment): SchemaPayment {
  return {
    id: payment.id,
    type: payment.type,
    state: payment.state,
    walletAddressId: payment.walletAddressId,
    client: payment.client,
    metadata: payment.metadata,
    createdAt: new Date(payment.createdAt).toISOString(),
    __typename: 'Payment'
  }
}
