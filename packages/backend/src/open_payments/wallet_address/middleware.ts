import { AppContext } from '../../app'

export function createWalletAddressMiddleware() {
  return async (
    ctx: AppContext,
    next: () => Promise<unknown>
  ): Promise<void> => {
    ctx.walletAddressUrl = `https://${ctx.request.host}/${ctx.params.walletAddressPath}`
    const config = await ctx.container.use('config')
    if (ctx.walletAddressUrl !== config.walletAddressUrl) {
      const walletAddressService = await ctx.container.use(
        'walletAddressService'
      )
      const walletAddress = await walletAddressService.getOrPollByUrl(
        ctx.walletAddressUrl
      )

      if (!walletAddress?.isActive) {
        ctx.throw(404)
      }
      ctx.walletAddress = walletAddress
    }
    await next()
  }
}
