import {
  ResolversTypes,
  MutationResolvers,
  Receiver as SchemaReceiver
} from '../generated/graphql'
import { ApolloContext } from '../../app'
import { Receiver } from '../../open_payments/receiver/model'

export const createReceiver: MutationResolvers<ApolloContext>['createReceiver'] =
  async (_, args, ctx): Promise<ResolversTypes['CreateReceiverResponse']> => {
    const receiverService = await ctx.container.use('receiverService')

    try {
      const receiver = await receiverService.create({
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
        receiver: receiverToGraphql(receiver)
      }
    } catch (error) {
      const errorMessage = 'Error trying to create receiver'
      ctx.logger.error({ error, args }, errorMessage)

      return {
        code: '500',
        success: false,
        message: errorMessage
      }
    }
  }

export function receiverToGraphql(receiver: Receiver): SchemaReceiver {
  if (!receiver.incomingPayment) {
    throw new Error('Missing incoming payment for receiver')
  }

  return {
    id: receiver.incomingPayment.id,
    paymentPointerUrl: receiver.incomingPayment.paymentPointer,
    expiresAt: receiver.incomingPayment.expiresAt.toISOString(),
    description: receiver.incomingPayment.description,
    incomingAmount: receiver.incomingPayment.incomingAmount,
    receivedAmount: receiver.incomingPayment.receivedAmount,
    externalRef: receiver.incomingPayment.externalRef,
    completed: receiver.incomingPayment.completed,
    createdAt: receiver.incomingPayment.createdAt.toISOString(),
    updatedAt: receiver.incomingPayment.updatedAt.toISOString()
  }
}
