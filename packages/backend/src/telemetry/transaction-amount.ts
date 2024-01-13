import { ValueType } from '@opentelemetry/api'
import { ConvertError, RatesService } from '../rates/service'
import { ConvertOptions } from '../rates/util'
import { TelemetryService } from './service'
import { privacy } from './privacy'
import { Asset } from '../rates/util'

export async function collectTelemetryAmount(
  telemetryService: TelemetryService,
  aseRates: RatesService,
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
      scale: 4
    }
  }
  const converted = await convertAmount(
    aseRates,
    telemetryService.getRatesService(),
    convertOptions
  )
  if (converted === ConvertError.InvalidDestinationPrice) {
    return
  }

  telemetryService
    .getOrCreate('transactions_amount', {
      description: 'Amount sent through the network',
      valueType: ValueType.DOUBLE
    })
    .add(privacy.applyPrivacy(Number(converted)))
}

export async function convertAmount(
  aseRates: RatesService,
  telemetryRates: RatesService,
  convertOptions: Omit<ConvertOptions, 'exchangeRate'>
) {
  try {
    const aseConvert = await aseRates.convert(convertOptions)
    return aseConvert
  } catch (error) {
    const telemetryRatesConverted = await telemetryRates.convert(convertOptions)
    return telemetryRatesConverted
  }
}
