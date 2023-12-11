import { ValueType } from '@opentelemetry/api'
import { ILPContext, ILPMiddleware } from '../rafiki'

export function createTelemetryMiddleware(): ILPMiddleware {
  return async (
    { request, services, accounts, state }: ILPContext,
    next: () => Promise<void>
  ): Promise<void> => {
    const { amount } = request.prepare
    if (state.unfulfillable || !Number(amount)) {
      await next()
      return
    }
    const { scale: incomingScale } = accounts.incoming.asset

    const scalingFactor = incomingScale
      ? Math.pow(10, 4 - incomingScale)
      : undefined

    const amountInScale4 = Number(amount) * Number(scalingFactor)

    services.telemetry
      ?.getOrCreate('transactions_amount', {
        description: 'Amount sent through the network',
        valueType: ValueType.DOUBLE
      })
      .add(amountInScale4, {
        source: services.telemetry?.getServiceName()
      })

    await next()
  }
}
