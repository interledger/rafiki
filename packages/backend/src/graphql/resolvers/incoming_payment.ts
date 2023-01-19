import {
  ResolversTypes,
  PaymentPointerResolvers,
  MutationResolvers,
  IncomingPayment as SchemaIncomingPayment
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

export const getPaymentPointerIncomingPayments: PaymentPointerResolvers<ApolloContext>['incomingPayments'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['IncomingPaymentConnection']> => {
    if (!parent.id) throw new Error('missing payment pointer id')
    const incomingPaymentService = await ctx.container.use(
      'incomingPaymentService'
    )
    const incomingPayments = await incomingPaymentService.getPaymentPointerPage(
      {
        paymentPointerId: parent.id,
        pagination: args
      }
    )
    const pageInfo = await getPageInfo(
      (pagination: Pagination) =>
        incomingPaymentService.getPaymentPointerPage({
          paymentPointerId: parent.id as string,
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
        paymentPointerId: args.input.paymentPointerId,
        expiresAt: !args.input.expiresAt
          ? undefined
          : new Date(args.input.expiresAt),
        description: args.input.description,
        incomingAmount: args.input.incomingAmount,
        externalRef: args.input.externalRef
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
    paymentPointerId: payment.paymentPointerId,
    state: payment.state,
    expiresAt: payment.expiresAt.toISOString(),
    incomingAmount: payment.incomingAmount,
    receivedAmount: payment.receivedAmount,
    description: payment.description,
    externalRef: payment.externalRef,
    createdAt: new Date(+payment.createdAt).toISOString()
  }
}
