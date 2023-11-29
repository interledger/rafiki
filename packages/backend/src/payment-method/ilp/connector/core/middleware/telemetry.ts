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
    const { code, scale } = accounts.incoming.asset

    const scalingFactor = scale ? Math.pow(10, 4 - scale) : undefined
    const totalReceivedInAssetScale4 = Number(amount) * Number(scalingFactor)

    services.telemetry
      ?.getOrCreate('transactions_amount', {
        description:
          'Amount sent through the network. Asset Code & Asset Scale are sent as attributes',
        valueType: ValueType.DOUBLE
      })
      .add(totalReceivedInAssetScale4, {
        asset_code: code,
        source: services.telemetry?.getServiceName()
      })

    await next()
  }
}
