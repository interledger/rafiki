import { ValueType } from '@opentelemetry/api'
import { ILPContext, ILPMiddleware } from '../rafiki'

export function createTelemetryMiddleware(): ILPMiddleware {
  return async (
    { request, services, accounts, response }: ILPContext,
    next: () => Promise<void>
  ): Promise<void> => {
    await next()

    const sourceAmount = BigInt(request.prepare.amount)

    if (services.telemetry && sourceAmount && response.fulfill) {
      const { code, scale } = accounts.outgoing.asset

      await services.telemetry.incrementCounterWithAmount(
        'transactions_amount',
        {
          sourceAmount,
          sourceAsset: { code: code, scale: scale }
        },
        {
          description: 'Amount sent through the network',
          valueType: ValueType.DOUBLE
        }
      )
    }
  }
}
