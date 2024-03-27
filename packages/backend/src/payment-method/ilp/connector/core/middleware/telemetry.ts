import { collectTelemetryAmount } from '../../../../../telemetry/transaction-amount'
import { ILPContext, ILPMiddleware } from '../rafiki'

export function createTelemetryMiddleware(): ILPMiddleware {
  return async (
    { request, services, accounts, response }: ILPContext,
    next: () => Promise<void>
  ): Promise<void> => {
    await next()
    if (
      services.telemetry &&
      Number(request.prepare.amount) &&
      response.fulfill
    ) {
      const { code, scale } = accounts.outgoing.asset
      collectTelemetryAmount(services.telemetry, services.logger, {
        amount: BigInt(request.prepare.amount),
        asset: { code: code, scale: scale }
      })
    }
  }
}
