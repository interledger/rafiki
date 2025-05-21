import { TelemetryService } from '../../../../telemetry/service'
import { IlpResponse } from './middleware/ilp-packet'
import { ValueType } from '@opentelemetry/api'

export function incrementPreparePacketCount(
  unfulfillable: boolean,
  prepareAmount: string,
  telemetry: TelemetryService
): void {
  if (!unfulfillable && Number(prepareAmount)) {
    telemetry.incrementCounter('packet_count_prepare', 1, {
      description: 'Count of prepare packets that are sent'
    })
  }
}

export function incrementFulfillOrRejectPacketCount(
  unfulfillable: boolean,
  prepareAmount: string,
  response: IlpResponse,
  telemetry: TelemetryService
): void {
  if (!unfulfillable && Number(prepareAmount)) {
    if (response.fulfill) {
      telemetry.incrementCounter('packet_count_fulfill', 1, {
        description: 'Count of fulfill packets'
      })
    } else if (response.reject) {
      telemetry.incrementCounter('packet_count_reject', 1, {
        description: 'Count of reject packets'
      })
    }
  }
}

export async function incrementAmount(
  unfulfillable: boolean,
  prepareAmount: string,
  response: IlpResponse,
  code: string,
  scale: number,
  telemetry: TelemetryService,
  tenantId?: string
): Promise<void> {
  if (!unfulfillable && Number(prepareAmount) && response.fulfill) {
    const value = BigInt(prepareAmount)
    await telemetry.incrementCounterWithTransactionAmount(
      'packet_amount_fulfill',
      {
        value,
        assetCode: code,
        assetScale: scale
      },
      tenantId,
      {
        description: 'Amount sent through the network',
        valueType: ValueType.DOUBLE
      }
    )
  }
}
