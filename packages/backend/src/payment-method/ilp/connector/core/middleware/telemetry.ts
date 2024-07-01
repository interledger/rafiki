import { collectTelemetryAmount } from '../../../../../telemetry/transaction-amount'
import { ILPContext, ILPMiddleware } from '../rafiki'

export function createTelemetryMiddleware(): ILPMiddleware {
  return async (
    { request, services, accounts, response }: ILPContext,
    next: () => Promise<void>
  ): Promise<void> => {
    if (services.telemetry && Number(request.prepare.amount)) {
      services.telemetry
        ?.getOrCreateMetric('packet_count_prepare', {
          description: 'Count of incoming prepare packets'
        })
        .add(1, {
          source: services.telemetry.getInstanceName()
        })
    }

    await next()

    if (
      services.telemetry &&
      Number(request.prepare.amount)
    ) {
      if (response.fulfill) {
        const { code, scale } = accounts.outgoing.asset
        collectTelemetryAmount(services.telemetry, services.logger, {
          amount: BigInt(request.prepare.amount),
          asset: { code: code, scale: scale }
        })
        services.telemetry
        ?.getOrCreateMetric('packet_count_fulfill', {
          description: 'Count of outgoing fulfill packets'
        })
        .add(1, {
          source: services.telemetry.getInstanceName()
        })
      } else if (response.reject) {
        services.telemetry
        ?.getOrCreateMetric('packet_count_reject', {
          description: 'Count of outgoing reject packets'
        })
        .add(1, {
          source: services.telemetry.getInstanceName()
        })
      }
    }
  }
}
