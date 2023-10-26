import {
  ResolversTypes,
  QueryResolvers,
  Payment as SchemaPayment
} from '../generated/graphql'
import { ApolloContext } from '../../app'
import { getPageInfo } from '../../shared/pagination'
import { Pagination } from '../../shared/baseModel'
import { CombinedPayment } from '../../open_payments/payment/combined/model'

export const getCombinedPayments: QueryResolvers<ApolloContext>['payments'] =
  async (parent, args, ctx): Promise<ResolversTypes['PaymentConnection']> => {
    const combinedPaymentService = await ctx.container.use(
      'combinedPaymentService'
    )
    const { filter, ...pagination } = args

    const getPageFn = (pagination_: Pagination) =>
      combinedPaymentService.getPage({ pagination: pagination_, filter })

    const payments = await getPageFn(pagination)
    const pageInfo = await getPageInfo(
      (pagination_: Pagination) => getPageFn(pagination_),
      payments
    )

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
    metadata: payment.metadata,
    createdAt: new Date(payment.createdAt).toISOString(),
    __typename: 'Payment'
  }
}
