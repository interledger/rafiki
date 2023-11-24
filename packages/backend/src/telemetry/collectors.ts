import { IlpObservabilityParameters } from '../payment-method/ilp/connector/core/rafiki'
import { Metrics, TelemetryService } from './meter'

export function collectTransactionsAmountMetric(
  telemetry: TelemetryService,
  params: IlpObservabilityParameters
): void {
  const { asset, amount, unfulfillable } = params

  if (unfulfillable) {
    //can collect metrics such as count of unfulfillable packets here
    return
  }

  console.log(
    `######################## [TELEMETRY]Gathering Transaction Amount Metric............`
  )

  const scalingFactor = asset.scale ? Math.pow(10, 4 - asset.scale) : undefined
  console.log(
    `scaling factor is: Math.pow(10 , 4 - ${asset.scale}) === ${scalingFactor}`
  )

  const totalReceivedInAssetScale4 = Number(amount) * Number(scalingFactor)

  console.log(
    `totalReceivedInAssetScale4 (${totalReceivedInAssetScale4}) =   totalReceived(${amount}) * scalingFactor(${scalingFactor})`
  )

  telemetry
    ?.getCounter(Metrics.TRANSACTIONS_AMOUNT)
    ?.add(totalReceivedInAssetScale4, {
      asset_code: asset.code,
      source: telemetry?.getServiceName() ?? 'Rafiki'
    })

  console.log(
    '######################## [TELEMETRY] Transaction Amount  Metric Collected ####################'
  )
}

export function collectTransactionCountMetric(
  telemetry: TelemetryService,
  assetCode?: string
): void {
  console.log(
    `######################## [TELEMETRY]Gathering Transaction Count Metric..........`
  )

  telemetry?.getCounter(Metrics.TRANSACTIONS_TOTAL)?.add(1, {
    source: telemetry?.getServiceName() ?? 'Rafiki',
    asset_code: assetCode
  })

  console.log(
    '######################## [TELEMETRY] Transaction Count  Metric Collected ####################'
  )
}
