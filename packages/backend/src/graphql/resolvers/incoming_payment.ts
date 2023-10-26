import {
  ResolversTypes,
  WalletAddressResolvers,
  MutationResolvers,
  IncomingPayment as SchemaIncomingPayment,
  QueryResolvers
} from '../generated/graphql'
import { IncomingPayment } from '../../open_payments/payment/incoming/model'
import {
  IncomingPaymentError,
  isIncomingPaymentError,
  errorToCode,
  errorToMessage
} from '../../open_payments/payment/incoming/errors'
import { ApolloContext } from '../../app'
import { getPageInfo } from '../../shared/pagination'
import { Pagination } from '../../shared/baseModel'

export const getIncomingPayment: QueryResolvers<ApolloContext>['incomingPayment'] =
  async (parent, args, ctx): Promise<ResolversTypes['IncomingPayment']> => {
    const incomingPaymentService = await ctx.container.use(
      'incomingPaymentService'
    )
    const payment = await incomingPaymentService.get({
      id: args.id
    })
    if (!payment) throw new Error('payment does not exist')
    return paymentToGraphql(payment)
  }

export const getWalletAddressIncomingPayments: WalletAddressResolvers<ApolloContext>['incomingPayments'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['IncomingPaymentConnection']> => {
    if (!parent.id) throw new Error('missing wallet address id')
    const incomingPaymentService = await ctx.container.use(
      'incomingPaymentService'
    )
    const incomingPayments = await incomingPaymentService.getWalletAddressPage({
      walletAddressId: parent.id,
      pagination: args
    })
    const pageInfo = await getPageInfo(
      (pagination: Pagination) =>
        incomingPaymentService.getWalletAddressPage({
          walletAddressId: parent.id as string,
          pagination
        }),
      incomingPayments
    )

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
export const createIncomingPayment: MutationResolvers<ApolloContext>['createIncomingPayment'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['IncomingPaymentResponse']> => {
    const incomingPaymentService = await ctx.container.use(
      'incomingPaymentService'
    )
    return incomingPaymentService
      .create({
        walletAddressId: args.input.walletAddressId,
        expiresAt: !args.input.expiresAt
          ? undefined
          : new Date(args.input.expiresAt),
        incomingAmount: args.input.incomingAmount,
        metadata: args.input.metadata
      })
      .then((paymentOrErr: IncomingPayment | IncomingPaymentError) =>
        isIncomingPaymentError(paymentOrErr)
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
        message: 'Error trying to create incoming payment'
      }))
  }

export function paymentToGraphql(
  payment: IncomingPayment
): SchemaIncomingPayment {
  return {
    id: payment.id,
    walletAddressId: payment.walletAddressId,
    state: payment.state,
    expiresAt: payment.expiresAt.toISOString(),
    incomingAmount: payment.incomingAmount,
    receivedAmount: payment.receivedAmount,
    metadata: payment.metadata,
    createdAt: new Date(+payment.createdAt).toISOString()
  }
}
