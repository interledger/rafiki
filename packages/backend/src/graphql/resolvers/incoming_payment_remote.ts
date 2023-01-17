import {
  ResolversTypes,
  MutationResolvers,
  RemoteIncomingPayment as SchemaRemoteIncomingPayment
} from '../generated/graphql'
import { ApolloContext } from '../../app'
import { IncomingPayment as OpenPaymentsIncomingPayment } from 'open-payments'
import { parseAmount } from '../../open_payments/amount'

export const createRemoteIncomingPayment: MutationResolvers<ApolloContext>['createRemoteIncomingPayment'] =
  async (
    _,
    args,
    ctx
  ): Promise<ResolversTypes['RemoteIncomingPaymentResponse']> => {
    const remoteIncomingPaymentService = await ctx.container.use(
      'remoteIncomingPaymentService'
    )

    try {
      const remoteIncomingPayment = await remoteIncomingPaymentService.create({
        paymentPointerUrl: args.input.paymentPointerUrl,
        expiresAt: args.input.expiresAt
          ? new Date(args.input.expiresAt)
          : undefined,
        description: args.input.description,
        incomingAmount: args.input.incomingAmount,
        externalRef: args.input.externalRef
      })

      return {
        code: '200',
        success: true,
        payment: paymentToGraphql(remoteIncomingPayment)
      }
    } catch (error) {
      const errorMessage = 'Error trying to create remote incoming payment'
      ctx.logger.error({ error, args }, errorMessage)

      return {
        code: '500',
        success: false,
        message: errorMessage
      }
    }
  }

export function paymentToGraphql(
  payment: OpenPaymentsIncomingPayment
): SchemaRemoteIncomingPayment {
  return {
    id: payment.id,
    createdAt: payment.createdAt,
    paymentPointerUrl: payment.paymentPointer,
    expiresAt: payment.expiresAt,
    updatedAt: payment.updatedAt,
    description: payment.description,
    incomingAmount: payment.incomingAmount
      ? parseAmount(payment.incomingAmount)
      : undefined,
    receivedAmount: parseAmount(payment.receivedAmount),
    completed: payment.completed,
    externalRef: payment.externalRef
  }
}
