import { Errors } from 'ilp-packet'
import { RafikiContext, RafikiMiddleware } from '../core'
const { AmountTooLargeError } = Errors

/**
 * @throws {AmountTooLargeError} Throws if the request amount is greater than the prescribed max packet amount.
 */
export function createIncomingMaxPacketAmountMiddleware (): RafikiMiddleware {
  return async (
    { services: { logger }, request, peers }: RafikiContext,
    next: () => Promise<any>
  ): Promise<void> => {
    const { maxPacketAmount } = await peers.incoming
    if (maxPacketAmount) {
      const amount = request.prepare.intAmount
      if (amount > maxPacketAmount) {
        logger.warn(
          'rejected a packet due to amount exceeding maxPacketAmount',
          { maxPacketAmount: maxPacketAmount.toString(), request }
        )
        throw new AmountTooLargeError(
          `packet size too large. maxAmount=${maxPacketAmount.toString()} actualAmount=${request.prepare.amount.toString()}`,
          {
            receivedAmount: request.prepare.amount.toString(),
            maximumAmount: maxPacketAmount.toString()
          }
        )
      }
    }
    await next()
  }
}
