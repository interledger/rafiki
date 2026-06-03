import { StreamServer, IncomingMoney } from '@interledger/stream-receiver'
import { ILPMiddleware, ILPContext } from '../rafiki'
import { TenantSettingKeys } from '../../../../../tenants/settings/model'
import { AuthState } from './auth'
import { isIlpReply } from 'ilp-packet'

const STREAM_DATA_STREAM_ID = 1

function getAdditionalDataFromReply(reply: IncomingMoney): string | undefined {
  const frames = reply.dataFrames
  if (!frames?.length) return undefined
  const payload =
    frames.find((f) => Number(f.streamId) === STREAM_DATA_STREAM_ID)?.data ??
    frames[0].data
  return payload?.length ? payload.toString('utf8') : undefined
}
export interface StreamState {
  streamDestination?: string
  streamServer?: StreamServer
  additionalData?: string
  connectionId?: string
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
        let payload: string | undefined
        if (!isIlpReply(replyOrMoney)) {
          payload = getAdditionalDataFromReply(replyOrMoney)
        }

        ctx.state.additionalData = payload
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
