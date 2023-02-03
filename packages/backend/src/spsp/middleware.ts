import { PaymentPointerContext, SPSPContext } from '../app'
import { ConnectionContext } from '../open_payments/connection/middleware'

export type SPSPConnectionContext = ConnectionContext &
  SPSPContext & {
    paymentPointer?: never
  }

export type SPSPPaymentPointerContext = PaymentPointerContext &
  SPSPContext & {
    incomingPayment?: never
  }

export const spspMiddleware = async (
  ctx: SPSPConnectionContext | SPSPPaymentPointerContext,
  next: () => Promise<unknown>
): Promise<void> => {
  // Fall back to legacy protocols if client doesn't support Open Payments.
  if (ctx.accepts('application/spsp4+json')) {
    const receiver = ctx.paymentPointer ?? ctx.incomingPayment
    ctx.paymentTag = receiver.id
    ctx.asset = {
      code: receiver.asset.code,
      scale: receiver.asset.scale
    }
    const spspRoutes = await ctx.container.use('spspRoutes')
    await spspRoutes.get(ctx)
  } else {
    await next()
  }
}
