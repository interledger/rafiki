import { v4 as uuid } from 'uuid'
import { isIlpReply } from 'ilp-packet'
import { IncomingMoney } from '@interledger/stream-receiver'
import { ILPContext, ILPMiddleware } from '../rafiki'
import { StreamState } from './stream-address'

const STREAM_DATA_STREAM_ID = 1

function getAdditionalDataFromReply(reply: IncomingMoney): string | undefined {
  const frames = reply.dataFrames
  if (!frames?.length) return undefined
  const payload =
    frames.find((f) => Number(f.streamId) === STREAM_DATA_STREAM_ID)?.data ??
    frames[0].data
  return payload?.length ? payload.toString('utf8') : undefined
}

export function createPartialPaymentDecisionMiddleware(): ILPMiddleware {
  return async (
    ctx: ILPContext<StreamState>,
    next: () => Promise<void>
  ): Promise<void> => {
    if (!ctx.state.streamDestination || !ctx.state.hasAdditionalData) {
      await next()
      return
    }
    //TODO Come back to handle assertion
    const streamServer = ctx.state.streamServer!
    const { prepare } = ctx.request
    const incomingPaymentId = ctx.state.streamDestination

    const replyOrMoney = streamServer.createReply(prepare)
    const additionalData = isIlpReply(replyOrMoney)
      ? undefined
      : getAdditionalDataFromReply(replyOrMoney)

    let decision: string
    try {
      const result = await ctx.services.incomingPayments.processPartialPayment(
        incomingPaymentId,
        {
          dataToTransmit: additionalData,
          partialIncomingPaymentId: uuid(),
          expiresAt: prepare.expiresAt
        }
      )
      if (result.decision === 'Additional data approved') {
        await next()
        return
      }
      decision = result.decision
    } catch (error) {
      ctx.services.logger.error(
        { error, incomingPaymentId },
        'failed to process partial payment'
      )
      decision = 'Error processing partial payment'
    }

    if (isIlpReply(replyOrMoney)) {
      ctx.response.reply = replyOrMoney
    } else {
      ctx.response.reply = replyOrMoney.finalDecline(decision)
    }
  }
}
