import { ValueType } from '@opentelemetry/api'
import { ConvertError } from '../rates/service'
import { Asset, ConvertOptions } from '../rates/util'
import { privacy } from './privacy'
import { TelemetryService } from './service'
import { Logger } from 'pino'

export async function collectTelemetryAmount(
  telemetryService: TelemetryService,
  logger: Logger,
  { amount, asset }: { amount: bigint; asset: Asset }
) {
  if (!amount) {
    return
  }

  const convertOptions: Omit<
    ConvertOptions,
    'exchangeRate' | 'destinationAsset'
  > = {
    sourceAmount: amount,
    sourceAsset: { code: asset.code, scale: asset.scale }
  }

  try {
    const converted = await telemetryService.convertAmount(convertOptions)
    if (converted === ConvertError.InvalidDestinationPrice) {
      return
    }

    telemetryService
      .getOrCreateMetric('transactions_amount', {
        description: 'Amount sent through the network',
        valueType: ValueType.DOUBLE
      })
      .add(privacy.applyPrivacy(Number(converted)))

    console.log('AFTER TELEMEGTRY AMOUNT', converted)
  } catch (e) {
    logger.error(e, `Unable to collect telemetry`)
  }
}
