import { v4 as uuid } from 'uuid'
import { ILPContext, ILPMiddleware } from '../rafiki'
import { StreamState } from './stream-address'
import { isIlpReply } from 'ilp-packet'

type PartialPaymentDecision = {
  success: boolean
  reason?: string
}

export function createPartialPaymentDecisionMiddleware(): ILPMiddleware {
  return async (
    ctx: ILPContext<StreamState>,
    next: () => Promise<void>
  ): Promise<void> => {
    if (!ctx.services.config.enablePartialPaymentDecision) {
      await next()
      return
    }
    if (!ctx.state.streamDestination || !ctx.state.additionalData) {
      await next()
      return
    }
    const { prepare } = ctx.request
    const incomingPaymentId = ctx.state.streamDestination
    const additionalData = ctx.state.additionalData
    const streamServer = ctx.state.streamServer
    if (!streamServer) {
      await next()
      return
    }
    const replyOrMoney = streamServer.createReply(ctx.request.prepare)
    if (isIlpReply(replyOrMoney)) {
      ctx.response.reply = replyOrMoney
      return
    }

    let decision: PartialPaymentDecision | undefined
    let reason: string | undefined

    try {
      decision = await ctx.services.incomingPayments.processPartialPayment(
        incomingPaymentId,
        {
          dataFromSender: additionalData,
          partialIncomingPaymentId: uuid(),
          expiresAt: prepare.expiresAt
        }
      )

      if (decision?.success !== false) {
        await next()
        return
      }
      reason = decision?.reason
    } catch (error) {
      // We intentionally *decline* instead of throwing: throwing would be
      // converted to an ILP Reject by `createIncomingErrorHandlerMiddleware`,
      // losing the human-readable partial decision reason that we pass here.
      ctx.services.logger.error(
        { error, incomingPaymentId },
        'failed to process partial payment'
      )
      reason = 'Error processing partial payment'
    }
    const errorData = Buffer.from(
      reason ?? 'Error processing partial payment',
      'utf8'
    )
    ctx.response.reply = replyOrMoney.finalDecline(errorData)
  }
}
