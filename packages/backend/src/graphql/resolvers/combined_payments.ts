import {
  ResolversTypes,
  QueryResolvers,
  Payment as SchemaPayment
} from '../generated/graphql'
import { TenantedApolloContext } from '../../app'
import { getPageInfo } from '../../shared/pagination'
import { Pagination, SortOrder } from '../../shared/baseModel'
import { CombinedPayment } from '../../open_payments/payment/combined/model'

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
