import { AppContext } from '../../app'
import { CreateBody as IncomingCreateBody } from '../../open_payments/payment/incoming/routes'
import { CreateBody as OutgoingCreateBody } from '../../open_payments/payment/outgoing/routes'
import { CreateBody as QuoteCreateBody } from '../../open_payments/quote/routes'

type CreateBody = IncomingCreateBody | OutgoingCreateBody | QuoteCreateBody

export function createWalletAddressMiddleware() {
  return async (
    ctx: AppContext,
    next: () => Promise<unknown>
  ): Promise<void> => {
    if (
      ctx.path === '/incoming-payments' ||
      ctx.path === '/outgoing-payments' ||
      ctx.path === '/quotes'
    ) {
      if (ctx.method === 'GET') {
        ctx.walletAddressUrl = ctx.query['wallet-address'] as string
      } else if (ctx.method === 'POST') {
        ctx.walletAddressUrl = (ctx.request.body as CreateBody).walletAddress
      } else {
        ctx.throw(401)
      }
    } else {
      ctx.walletAddressUrl = `https://${ctx.request.host}/${ctx.params.walletAddressPath}`
    }

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
