import { AppContext } from '../../app'

export function createPaymentPointerMiddleware() {
  return async (
    ctx: AppContext,
    next: () => Promise<unknown>
  ): Promise<void> => {
    const paymentPointerService = await ctx.container.use(
      'paymentPointerService'
    )
    const paymentPointer = await paymentPointerService.getByUrl(
      `https://${ctx.request.host}/${ctx.params.paymentPointerPath}`
    )
    if (!paymentPointer) {
      ctx.throw(404)
    }
    ctx.paymentPointer = paymentPointer
    await next()
  }
}
