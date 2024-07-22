import { ValueType } from '@opentelemetry/api'
import { ILPContext, ILPMiddleware } from '../rafiki'

export function createTelemetryMiddleware(): ILPMiddleware {
  return async (
    { request, services, accounts, response }: ILPContext,
    next: () => Promise<void>
  ): Promise<void> => {
    await next()

    const value = BigInt(request.prepare.amount)

    if (services.telemetry && value && response.fulfill) {
      const { code: assetCode, scale: assetScale } = accounts.outgoing.asset

      await services.telemetry.incrementCounterWithTransactionAmount(
        'transactions_amount',
        {
          value,
          assetCode,
          assetScale
        },
        {
          description: 'Amount sent through the network',
          valueType: ValueType.DOUBLE
        }
      )
    }
  }
}
