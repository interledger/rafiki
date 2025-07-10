import { ILPMiddleware, ILPContext } from '../rafiki'
import { AuthState } from './auth'
import { StreamServer } from '@interledger/stream-receiver'

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
    const ilpAddress = ctx.services.config.ilpAddress
    ctx.state.streamServer = ilpAddress
      ? new StreamServer({
          serverSecret: ctx.services.config.streamSecret,
          serverAddress: ilpAddress
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
