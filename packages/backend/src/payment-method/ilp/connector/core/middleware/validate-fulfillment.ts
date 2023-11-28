import { createHash } from 'crypto'
import { ILPContext, ILPMiddleware } from '..'
import { Errors } from 'ilp-packet'

const { WrongConditionError } = Errors

export function createOutgoingValidateFulfillmentMiddleware(): ILPMiddleware {
  return async (
    { services: { logger }, request: { prepare }, response }: ILPContext,
    next: () => Promise<void>
  ): Promise<void> => {
    const { executionCondition } = prepare
    await next()
    if (response.fulfill) {
      const { fulfillment } = response.fulfill
      const calculatedCondition = createHash('sha256')
        .update(fulfillment)
        .digest()
      if (!calculatedCondition.equals(executionCondition)) {
        logger.warn({ response }, 'invalid fulfillment')
        throw new WrongConditionError(
          'fulfillment did not match expected value.'
        )
      }
    }
  }
}
