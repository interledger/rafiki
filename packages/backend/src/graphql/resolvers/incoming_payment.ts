import { ResolversTypes, AccountResolvers } from '../generated/graphql'
import { IncomingPayment } from '../../open_payments/payment/incoming/model'
import { ApolloContext } from '../../app'
import { getPageInfo } from '../../shared/pagination'
import { Pagination } from '../../shared/baseModel'

export const getAccountIncomingPayments: AccountResolvers<ApolloContext>['incomingPayments'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['IncomingPaymentConnection']> => {
    if (!parent.id) throw new Error('missing account id')
    const incomingPaymentService = await ctx.container.use(
      'incomingPaymentService'
    )
    const incomingPayments = await incomingPaymentService.getAccountPage(
      parent.id,
      args
    )
    const pageInfo = await getPageInfo(
      (pagination: Pagination) =>
        incomingPaymentService.getAccountPage(parent.id as string, pagination),
      incomingPayments
    )

    return {
      pageInfo,
      edges: incomingPayments.map((incomingPayment: IncomingPayment) => {
        return {
          cursor: incomingPayment.id,
          node: {
            ...incomingPayment,
            receivedAmount: incomingPayment.receivedAmount,
            expiresAt: incomingPayment.expiresAt.toISOString(),
            createdAt: incomingPayment.createdAt?.toISOString()
          }
        }
      })
    }
  }
