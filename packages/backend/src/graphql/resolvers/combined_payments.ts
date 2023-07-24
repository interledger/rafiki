import {
  ResolversTypes,
  QueryResolvers,
  Payment as SchemaPayment,
  PaymentType as SchemaPaymentType
} from '../generated/graphql'
import { ApolloContext } from '../../app'
import { getPageInfo } from '../../shared/pagination'
import { Pagination } from '../../shared/baseModel'
import {
  Payment,
  PaymentType
} from '../../open_payments/payment/combined/model'
import { paymentToGraphql as incomingPaymentToGraphql } from './incoming_payment'
import { paymentToGraphql as outgoingPaymentToGraphql } from './outgoing_payment'
import { OutgoingPayment } from '../../open_payments/payment/outgoing/model'
import { IncomingPayment } from '../../open_payments/payment/incoming/model'

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
      edges: payments.map((payment: Payment) => {
        return {
          cursor: payment.payment.id,
          node: paymentToGraphql(payment)
        }
      })
    }
  }

function paymentToGraphql(payment: Payment): SchemaPayment {
  if (payment.type === PaymentType.Outgoing) {
    return {
      type: SchemaPaymentType.Outgoing,
      payment: {
        ...outgoingPaymentToGraphql(
          payment.payment as unknown as OutgoingPayment
        ),
        __typename: 'OutgoingPayment'
      }
    }
  } else {
    return {
      type: SchemaPaymentType.Incoming,
      payment: {
        ...incomingPaymentToGraphql(
          payment.payment as unknown as IncomingPayment
        ),
        __typename: 'IncomingPayment'
      }
    }
  }
}
