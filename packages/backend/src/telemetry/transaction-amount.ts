import { ValueType } from '@opentelemetry/api'
import { ConvertError } from '../rates/service'
import { Asset } from '../rates/util'
import { privacy } from './privacy'
import { TelemetryService } from './service'

export async function collectTelemetryAmount(
  telemetryService: TelemetryService,
  { amount, asset }: { amount: bigint; asset: Asset }
) {
  if (!amount) {
    return
  }

  const convertOptions = {
    sourceAmount: amount,
    sourceAsset: { code: asset.code, scale: asset.scale },
    destinationAsset: {
      code: telemetryService.getBaseAssetCode(),
      scale: telemetryService.getBaseScale()
    }
  }

  try {
    const converted = await telemetryService.convertAmount(convertOptions)
    if (converted === ConvertError.InvalidDestinationPrice) {
      return
    }

    telemetryService
      .getOrCreate('transactions_amount', {
        description: 'Amount sent through the network',
        valueType: ValueType.DOUBLE
      })
      .add(privacy.applyPrivacy(Number(converted)))
  } catch (e) {
    console.error(`Unable to collect telemetry`, e)
  }
}
