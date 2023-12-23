import { ValueType } from '@opentelemetry/api'
import { ILPContext, ILPMiddleware } from '../rafiki'
import { privacy } from '../../../../../telemetry/privacy'
import { ConvertError } from '../../../../../rates/service'

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
    const senderAsset = accounts.outgoing.asset

    const convertOptions = {
      sourceAmount: BigInt(amount),
      sourceAsset: { code: senderAsset.code, scale: senderAsset.scale },
      destinationAsset: {
        code: services.telemetry!.getBaseAssetCode(),
        scale: 4
      }
    }

    const converted = await services.telemetry
      .getRatesService()
      .convert(convertOptions)
    if (converted === ConvertError.InvalidDestinationPrice) {
      await next()
      return
    }

    services.telemetry
      ?.getOrCreate('transactions_amount', {
        description: 'Amount sent through the network',
        valueType: ValueType.DOUBLE
      })
      .add(privacy.applyPrivacy(Number(converted)), {
        source: services.telemetry?.getServiceName()
      })

    await next()
  }
}
