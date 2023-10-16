import { AppContext } from '../../app'
import { CreateBody as IncomingCreateBody } from '../../open_payments/payment/incoming/routes'
import { CreateBody as OutgoingCreateBody } from '../../open_payments/payment/outgoing/routes'

type CreateBody = IncomingCreateBody | OutgoingCreateBody

export function createPaymentPointerMiddleware() {
  return async (
    ctx: AppContext,
    next: () => Promise<unknown>
  ): Promise<void> => {
    if (ctx.path === '/incoming-payments' || ctx.path === '/outgoing-payments') {
      if (ctx.method === 'GET') {
        ctx.paymentPointerUrl = ctx.query['wallet-address'] as string
      } else if (ctx.method === 'POST') {
        ctx.paymentPointerUrl = (ctx.request.body as CreateBody).walletAddress  
      } else {
        ctx.throw(401)
      }
    } else {
      ctx.paymentPointerUrl = `https://${ctx.request.host}/${ctx.params.paymentPointerPath}`
    }
    const config = await ctx.container.use('config')
    if (ctx.paymentPointerUrl !== config.paymentPointerUrl) {
      const paymentPointerService = await ctx.container.use(
        'paymentPointerService'
      )
      const paymentPointer = await paymentPointerService.getOrPollByUrl(
        ctx.paymentPointerUrl
      )

      if (!paymentPointer?.isActive) {
        ctx.throw(404)
      }
      ctx.paymentPointer = paymentPointer
    }
    await next()
  }
}
