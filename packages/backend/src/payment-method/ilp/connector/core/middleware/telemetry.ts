import { ValueType } from '@opentelemetry/api'
import { ILPContext, ILPMiddleware } from '../rafiki'
import { privacy } from '../../../../../telemetry/privacy'
import { ConvertError } from '../../../../../rates/service'
import { TelemetryService } from '../../../../../telemetry/meter'
import { ConvertOptions } from '../../../../../rates/util'

export async function collectTelemetryAmount(
  telemetryService: TelemetryService,
  convertOptions: Omit<ConvertOptions, 'exchangeRate'>
) {
  const converted = await telemetryService
    .getRatesService()
    .convert(convertOptions)
  if (converted === ConvertError.InvalidDestinationPrice) {
    return
  }

  telemetryService
    .getOrCreate('transactions_amount', {
      description: 'Amount sent through the network',
      valueType: ValueType.DOUBLE
    })
    .add(privacy.applyPrivacy(Number(converted)), {
      source: telemetryService.getServiceName()
    })
}

export function createTelemetryMiddleware(): ILPMiddleware {
  return async (
    { request, services, accounts, state }: ILPContext,
    next: () => Promise<void>
  ): Promise<void> => {
    if (
      services.telemetry &&
      Number(request.prepare.amount) &&
      !state.unfulfillable
    ) {
      const senderAsset = accounts.outgoing.asset
      const convertOptions = {
        sourceAmount: BigInt(request.prepare.amount),
        sourceAsset: { code: senderAsset.code, scale: senderAsset.scale },
        destinationAsset: {
          code: services.telemetry.getBaseAssetCode(),
          scale: 4
        }
      }

      collectTelemetryAmount(services.telemetry, convertOptions)
    }

    await next()
  }
}
