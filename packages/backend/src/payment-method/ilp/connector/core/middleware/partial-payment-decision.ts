import { Errors } from 'ilp-packet'
import { v4 as uuid } from 'uuid'
import { ILPContext, ILPMiddleware } from '../rafiki'
import { StreamState } from './stream-address'

export function createPartialPaymentDecisionMiddleware(): ILPMiddleware {
  return async (
    ctx: ILPContext<StreamState>,
    next: () => Promise<void>
  ): Promise<void> => {
    if (!ctx.state.streamDestination || !ctx.state.hasAdditionalData) {
      await next()
      return
    }

    const incomingPaymentId = ctx.state.streamDestination
    const partialIncomingPaymentId = uuid()
    const expiresAt = ctx.request.prepare.expiresAt

    // Extract additional data from frames if available
    let additionalData: string | undefined
    if (ctx.state.streamServer && incomingPaymentId) {
      try {
        const replyOrMoney = ctx.state.streamServer.createReply(
          ctx.request.prepare
        )
        const frames = (replyOrMoney as any).dataFrames as
          | Array<{ streamId: number; offset: string; data: Buffer }>
          | undefined
        const payload = frames?.length
          ? frames.find((f) => f.streamId === 1)?.data ?? frames[0].data
          : undefined

        if (payload && payload.length > 0) {
          additionalData = payload.toString('utf8')
        }
      } catch (e) {
        ctx.services.logger.warn({ e }, 'failed to extract additional data')
      }
    }

    let result
    let errorMessage: string | undefined
    try {
      result = await ctx.services.incomingPayments.processPartialPayment(
        incomingPaymentId,
        {
          dataToTransmit: additionalData,
          partialIncomingPaymentId,
          expiresAt
        }
      )

      if (result.decision === 'Additional data approved') {
        await next()
        return
      }

      errorMessage = result.decision
    } catch (error) {
      ctx.services.logger.error(
        { error, incomingPaymentId },
        'failed to process partial payment'
      )
      errorMessage = 'Error processing partial payment'
    }

    throw new Errors.FinalApplicationError(
      'Data failed verification',
      Buffer.from(errorMessage || 'Unknown error', 'utf8')
    )
  }
}
