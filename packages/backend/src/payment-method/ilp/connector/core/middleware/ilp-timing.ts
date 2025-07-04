import {
  ILPContext,
  ILPMiddleware,
  IncomingAccount,
  OutgoingAccount
} from '../rafiki'
import { IncomingPayment } from '../../../../../open_payments/payment/incoming/model'
import { OutgoingPayment } from '../../../../../open_payments/payment/outgoing/model'
import { Peer } from '../../../peer/model'

function determineOperation(
  incoming: IncomingAccount,
  outgoing: OutgoingAccount
): string {
  if (incoming instanceof OutgoingPayment && outgoing instanceof Peer) {
    return 'outgoing_payment'
  }

  if (incoming instanceof Peer && outgoing instanceof IncomingPayment) {
    return 'incoming_payment'
  }

  if (incoming instanceof Peer && outgoing instanceof Peer) {
    return 'routing'
  }
  // Rate probes will fall into this category
  return 'unknown'
}

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
      if (ctx.accounts?.incoming && ctx.accounts?.outgoing) {
        operation = determineOperation(
          ctx.accounts.incoming,
          ctx.accounts.outgoing
        )
      }

      stopTimer({
        operation
      })
    }
  }
}
