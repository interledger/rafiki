import { StreamServer } from '@interledger/stream-receiver'
import { ILPMiddleware, ILPContext } from '../rafiki'
import { TenantSettingKeys } from '../../../../../tenants/settings/model'

export function createStreamAddressMiddleware(): ILPMiddleware {
  return async (ctx: ILPContext, next: () => Promise<void>): Promise<void> => {
    const stopTimer = ctx.services.telemetry.startTimer(
      'create_stream_address_middleware_decode_tag',
      {
        callName: 'createStreamAddressMiddleware:decodePaymentTag'
      }
    )

    ctx.state.streamServer = new StreamServer({
      serverSecret: ctx.services.config.streamSecret,
      serverAddress: await getIlpAddressForTenant(ctx)
    })

    ctx.state.streamDestination = ctx.state.streamServer.decodePaymentTag(
      ctx.request.prepare.destination
    )

    stopTimer()
    await next()
  }
}

export async function getIlpAddressForTenant(ctx: ILPContext): Promise<string> {
  const tenantId = ctx.state.incomingAccount?.tenantId

  if (tenantId === ctx.services.config.operatorTenantId) {
    return ctx.services.config.ilpAddress
  }

  const tenantSettings = await ctx.services.tenantSettingService.get({
    tenantId,
    key: TenantSettingKeys.ILP_ADDRESS.name
  })

  if (!tenantSettings.length) {
    return ctx.services.config.ilpAddress // Fall back to operator ILP address
  }

  return tenantSettings[0].value
}
