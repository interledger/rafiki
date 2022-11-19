import { AppContext } from '../../app'

export function createPaymentPointerMiddleware() {
  return async (
    ctx: AppContext,
    next: () => Promise<unknown>
  ): Promise<void> => {
    const url = `https://${ctx.request.host}/${ctx.params.paymentPointerPath}`
    const config = await ctx.container.use('config')
    if (url !== config.paymentPointerUrl) {
      const paymentPointerService = await ctx.container.use(
        'paymentPointerService'
      )
      const paymentPointer = await paymentPointerService.getByUrl(url)
      if (!paymentPointer) {
        ctx.throw(404)
      }
      ctx.paymentPointer = paymentPointer
    }
    await next()
  }
}
