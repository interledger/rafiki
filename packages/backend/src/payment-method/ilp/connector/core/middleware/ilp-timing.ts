import {
  ILPContext,
  ILPMiddleware
} from '../rafiki'

export function createIlpTimingMiddleware(): ILPMiddleware {
  return async function ilpTiming(
    ctx: ILPContext,
    next: () => Promise<void>
  ): Promise<void> {
    if (!ctx.services.config.enableIlpTiming) {
      await next()
      return
    }

    const { telemetry } = ctx.services
    let operation = 'unknown'
    const stopTimer = telemetry.startTimer('ilp_prepare_packet_processing_ms', {
      operation
    })

    try {
      await next()
    } finally {
      stopTimer({
        operation: ctx.state.operation
      })
    }
  }
}
