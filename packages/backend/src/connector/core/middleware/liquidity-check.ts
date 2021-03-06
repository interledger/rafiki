import { ILPContext, ILPMiddleware } from '..'
import { Errors } from 'ilp-packet'
const { T04_INSUFFICIENT_LIQUIDITY } = Errors.codes

/**
 * Log error for reject packets caused by insufficient liquidity or an exceeded maximum balance.
 */
export function createOutgoingLiquidityCheckMiddleware(): ILPMiddleware {
  return async (
    { services: { logger }, response, accounts: { outgoing } }: ILPContext,
    next: () => Promise<void>
  ): Promise<void> => {
    await next()

    if (response.reject) {
      if (response.reject.code !== T04_INSUFFICIENT_LIQUIDITY) return

      // The peer rejected a packet which, according to the local balance, should
      // have succeeded. This can happen when our local connector owes the peer
      // money but restarted before it was settled.
      if (response.reject.message !== 'exceeded maximum balance.') return

      logger.error(
        {
          peerId: outgoing.id,
          triggerBy: response.reject.triggeredBy,
          message: response.reject.message
        },
        'Liquidity Check Error'
      )
    }
  }
}
