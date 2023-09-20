import { AppContext } from '../../app'

export function createPaymentPointerMiddleware() {
  return async (
    ctx: AppContext,
    next: () => Promise<unknown>
  ): Promise<void> => {
    console.log('createPaymentPointerMiddleware called', {
      response: JSON.stringify(ctx.response, null, 2)
    })
    ctx.paymentPointerUrl = `https://${ctx.request.host}/${ctx.params.paymentPointerPath}`
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
    console.log('createPaymentPointerMiddleware ended', {
      response: JSON.stringify(ctx.response, null, 2)
    })
    await next()
  }
}
