import {
  ResolversTypes,
  MutationResolvers,
  Receiver as SchemaReceiver,
  QueryResolvers
} from '../generated/graphql'
import { ApolloContext } from '../../app'
import { Receiver } from '../../open_payments/receiver/model'
import {
  isReceiverError,
  errorToCode as receiverErrorToCode,
  errorToMessage as receiverErrorToMessage
} from '../../open_payments/receiver/errors'
import { GraphQLError } from 'graphql'

export const getReceiver: QueryResolvers<ApolloContext>['receiver'] = async (
  _,
  args,
  ctx
): Promise<ResolversTypes['Receiver']> => {
  const receiverService = await ctx.container.use('receiverService')
  const receiver = await receiverService.get(args.id)
  if (!receiver) {
    ctx.logger.error(`Receiver "${args.id}" was not found.`)
    throw new Error('receiver does not exist')
  }
  return receiverToGraphql(receiver)
}

export const createReceiver: MutationResolvers<ApolloContext>['createReceiver'] =
  async (_, args, ctx): Promise<ResolversTypes['CreateReceiverResponse']> => {
    const receiverService = await ctx.container.use('receiverService')

    const receiverOrError = await receiverService.create({
      walletAddressUrl: args.input.walletAddressUrl,
      expiresAt: args.input.expiresAt
        ? new Date(args.input.expiresAt)
        : undefined,
      incomingAmount: args.input.incomingAmount,
      metadata: args.input.metadata
    })

    if (isReceiverError(receiverOrError)) {
      throw new GraphQLError(receiverErrorToMessage(receiverOrError), {
        extensions: {
          code: receiverErrorToCode(receiverOrError)
        }
      })
    }

    return {
      receiver: receiverToGraphql(receiverOrError)
    }
  }

export function receiverToGraphql(receiver: Receiver): SchemaReceiver {
  if (!receiver.incomingPayment) {
    throw new Error('Missing incoming payment for receiver')
  }

  return {
    id: receiver.incomingPayment.id,
    walletAddressUrl: receiver.incomingPayment.walletAddress,
    expiresAt: receiver.incomingPayment.expiresAt?.toISOString(),
    incomingAmount: receiver.incomingPayment.incomingAmount,
    receivedAmount: receiver.incomingPayment.receivedAmount,
    metadata: receiver.incomingPayment.metadata,
    completed: receiver.incomingPayment.completed,
    createdAt: receiver.incomingPayment.createdAt.toISOString(),
    updatedAt: receiver.incomingPayment.updatedAt.toISOString()
  }
}
