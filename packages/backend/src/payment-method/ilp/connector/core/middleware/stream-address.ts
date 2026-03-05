import { StreamServer } from '@interledger/stream-receiver'
import { ILPMiddleware, ILPContext } from '../rafiki'
import { TenantSettingKeys } from '../../../../../tenants/settings/model'
import { AuthState } from './auth'

export interface StreamState {
  streamDestination?: string
  streamServer?: StreamServer
  hasAdditionalData?: boolean
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

    // Decode frames to check for additional data
    try {
      if (ctx.state.streamServer && ctx.state.streamDestination) {
        const replyOrMoney = ctx.state.streamServer.createReply(
          ctx.request.prepare
        )
        const frames = (replyOrMoney as any).dataFrames as
          | Array<{ streamId: number; offset: string; data: Buffer }>
          | undefined
        const payload = frames?.length
          ? frames.find((f) => f.streamId === 1)?.data ?? frames[0].data
          : undefined
        
        if (payload && payload.length > 0) {
          ctx.services.logger.info(
            { payload: payload.toString('utf8') },
            'STREAM additional data received'
          )
        }

        ctx.state.hasAdditionalData = !!payload?.length
        //TODO Here we should store STREAM data payload i.e. db call in webhook events table
      }
    } finally {
      stopTimer()
      await next()
    }
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
