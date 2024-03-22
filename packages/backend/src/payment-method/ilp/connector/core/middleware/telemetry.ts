import { collectTelemetryAmount } from '../../../../../telemetry/transaction-amount'
import { ILPContext, ILPMiddleware } from '../rafiki'

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
      const { code, scale } = accounts.outgoing.asset
      collectTelemetryAmount(services.telemetry, services.logger, {
        amount: BigInt(request.prepare.amount),
        asset: { code: code, scale: scale }
      })
    }
    await next()
  }
}
