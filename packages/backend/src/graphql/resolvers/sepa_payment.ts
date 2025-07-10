import {
  ResolversTypes,
  MutationResolvers
} from '../generated/graphql'
import { isIncomingPaymentError, errorToMessage } from '../../open_payments/payment/incoming/errors'
import { parseAmount } from '../../open_payments/amount'
import { OutgoingPaymentState } from '../../open_payments/payment/outgoing/model'
import { ApolloContext } from '../../app'
import { GraphQLError } from 'graphql'
import { GraphQLErrorCode } from '../errors'

export const completeSepaPayment: MutationResolvers<ApolloContext>['completeSepaPayment'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['CompleteSepaPaymentResponse']> => {
    const incomingPaymentService = await ctx.container.use('incomingPaymentService')
    const outgoingPaymentService = await ctx.container.use('outgoingPaymentService')
    const logger = await ctx.container.use('logger')

    const { paymentId, paymentType, receivedAmount, metadata } = args.input

    logger.info(
      {
        paymentId,
        paymentType,
        receivedAmount,
        metadata
      },
      'SEPA payment completion request received via GraphQL'
    )

    const parsedReceivedAmount = parseAmount({
      value: receivedAmount.value.toString(),
      assetCode: receivedAmount.assetCode,
      assetScale: receivedAmount.assetScale
    })

    if (paymentType === 'incoming') {
      // Handle incoming payment completion (recipient instance)
      const incomingPaymentOrError = await incomingPaymentService.complete(paymentId)

      if (isIncomingPaymentError(incomingPaymentOrError)) {
        logger.error(
          {
            paymentId,
            paymentType,
            error: incomingPaymentOrError
          },
          'Failed to complete incoming payment for SEPA via GraphQL'
        )
        throw new GraphQLError(errorToMessage[incomingPaymentOrError], {
          extensions: {
            code: GraphQLErrorCode.BadUserInput
          }
        })
      }

      logger.info(
        {
          paymentId,
          paymentType,
          receivedAmount: parsedReceivedAmount,
          paymentState: incomingPaymentOrError.state
        },
        'SEPA incoming payment completed successfully via GraphQL'
      )

      return {
        success: true,
        paymentId,
        paymentType,
        receivedAmount: parsedReceivedAmount,
        metadata,
        message: 'Incoming payment marked as completed'
      }
    } else if (paymentType === 'outgoing') {
      // Handle outgoing payment completion (sender instance)
      // Get the outgoing payment first
      const outgoingPayment = await outgoingPaymentService.get({ id: paymentId })
      
      if (!outgoingPayment) {
        logger.error(
          {
            paymentId,
            paymentType
          },
          'Outgoing payment not found for SEPA completion via GraphQL'
        )
        throw new GraphQLError('Outgoing payment not found', {
          extensions: {
            code: GraphQLErrorCode.NotFound
          }
        })
      }

      // Check if payment is in a valid state to be completed
      if (outgoingPayment.state !== OutgoingPaymentState.Sending && outgoingPayment.state !== OutgoingPaymentState.Funding) {
        logger.error(
          {
            paymentId,
            paymentType,
            currentState: outgoingPayment.state
          },
          'Outgoing payment is not in a valid state for completion via GraphQL'
        )
        throw new GraphQLError(`Outgoing payment is in ${outgoingPayment.state} state and cannot be completed`, {
          extensions: {
            code: GraphQLErrorCode.BadUserInput
          }
        })
      }

      await outgoingPayment.$query().patch({
        state: OutgoingPaymentState.Completed
      })

      const updatedOutgoingPayment = await outgoingPaymentService.get({ id: paymentId })

      logger.info(
        {
          paymentId,
          paymentType,
          receivedAmount: parsedReceivedAmount,
          paymentState: updatedOutgoingPayment?.state
        },
        'SEPA outgoing payment completed successfully via GraphQL'
      )

      return {
        success: true,
        paymentId,
        paymentType,
        receivedAmount: parsedReceivedAmount,
        metadata,
        message: 'Outgoing payment marked as completed'
      }
    } else {
      logger.error(
        {
          paymentId,
          paymentType
        },
        'Invalid payment type for SEPA completion via GraphQL'
      )
      throw new GraphQLError('Invalid payment type. Must be "incoming" or "outgoing"', {
        extensions: {
          code: GraphQLErrorCode.BadUserInput
        }
      })
    }
  } 