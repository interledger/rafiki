import { ValueType } from '@opentelemetry/api'
import { ILPContext, ILPMiddleware } from '../rafiki'

export function createTelemetryMiddleware(): ILPMiddleware {
  return async (
    { request, services, accounts, state }: ILPContext,
    next: () => Promise<void>
  ): Promise<void> => {
    if (!services.telemetry) {
      await next()
      return
    }
    const { amount } = request.prepare
    if (state.unfulfillable || !Number(amount)) {
      await next()
      return
    }

    const senderAssetCode = accounts.outgoing.asset.code
    const senderScale = accounts.outgoing.asset.scale

    const convertOptions = {
      sourceAmount: BigInt(amount),
      sourceAsset: { code: senderAssetCode, scale: senderScale },
      destinationAsset: {
        code: services.telemetry!.getBaseAssetCode(),
        scale: 4
      }
    }

    const converted = Number(
      await services.telemetry
        .getTelemetryRatesService()
        .convert(convertOptions)
    )

    services.telemetry
      ?.getOrCreate('transactions_amount', {
        description: 'Amount sent through the network',
        valueType: ValueType.DOUBLE
      })
      .add(services.telemetry.applyPrivacy(converted), {
        source: services.telemetry?.getServiceName()
      })

    await next()
  }
}
