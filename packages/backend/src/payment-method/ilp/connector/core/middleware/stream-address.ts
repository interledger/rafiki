import { StreamServer } from '@interledger/stream-receiver'
import { ILPMiddleware, ILPContext } from '../rafiki'
import { TenantSettingKeys } from '../../../../../tenants/settings/model'
import { AuthState } from './auth'

export interface StreamState {
  streamDestination?: string
  streamServer?: StreamServer
}

export function createStreamAddressMiddleware(): ILPMiddleware {
  return async (
    ctx: ILPContext<AuthState & StreamState>,
    next: () => Promise<void>
  ): Promise<void> => {
    const stopTimer = ctx.services.telemetry.startTimer(
      'create_stream_address_middleware_decode_tag',
      {
        callName: 'createStreamAddressMiddleware:decodePaymentTag'
      }
    )

    const tenantIlpAddress = await getIlpAddressForTenant(ctx)

    ctx.state.streamServer = tenantIlpAddress
      ? new StreamServer({
          serverSecret: ctx.services.config.streamSecret,
          serverAddress: tenantIlpAddress
        })
      : undefined

    ctx.state.streamDestination =
      ctx.state.streamServer?.decodePaymentTag(
        ctx.request.prepare.destination
      ) || undefined

    stopTimer()
    await next()
  }
}

export async function getIlpAddressForTenant(
  ctx: ILPContext<AuthState & StreamState>
): Promise<string | undefined> {
  const tenantId = ctx.state.incomingAccount?.tenantId

  if (!tenantId) {
    return undefined
  }

  if (tenantId === ctx.services.config.operatorTenantId) {
    return ctx.services.config.ilpAddress
  }

  const tenantSettings = await ctx.services.tenantSettingService.get({
    tenantId,
    key: TenantSettingKeys.ILP_ADDRESS.name
  })

  return tenantSettings.length > 0 ? tenantSettings[0].value : undefined
}
