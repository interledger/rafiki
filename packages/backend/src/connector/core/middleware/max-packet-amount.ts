import { Errors } from 'ilp-packet'
import { AuthState } from './auth'
import { ILPContext, ILPMiddleware } from '..'
const { AmountTooLargeError } = Errors

/**
 * @throws {AmountTooLargeError} Throws if the request amount is greater than the prescribed max packet amount.
 */
export function createIncomingMaxPacketAmountMiddleware(): ILPMiddleware {
  return async (
    { services: { logger }, request, state: { peer } }: ILPContext<AuthState>,
    next: () => Promise<void>
  ): Promise<void> => {
    if (peer?.maxPacketAmount) {
      const { maxPacketAmount } = peer
      const amount = request.prepare.intAmount
      if (amount > maxPacketAmount) {
        logger.warn(
          { maxPacketAmount: maxPacketAmount.toString(), request },
          'rejected a packet due to amount exceeding maxPacketAmount'
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
