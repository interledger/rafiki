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
    if (ctx.method === 'GET') {
      if (ctx.path && ctx.path.startsWith('/incoming-payments')) {
        const incomingPaymentService = await ctx.container.use(
          'incomingPaymentService'
        )
        const incomingPayment = await incomingPaymentService.get({
          id: ctx.params.id
        })
        if (!incomingPayment || !incomingPayment.walletAddress) {
          ctx.throw(401)
        }
        ctx.walletAddressUrl = incomingPayment.walletAddress.url
      } else if (ctx.path && ctx.path.startsWith('/outgoing-payments')) {
        const outgoingPaymentService = await ctx.container.use(
          'outgoingPaymentService'
        )
        const outgoingPayment = await outgoingPaymentService.get({
          id: ctx.params.id
        })
        if (!outgoingPayment || !outgoingPayment.walletAddress) {
          ctx.throw(401)
        }
        ctx.walletAddressUrl = outgoingPayment.walletAddress.url
      } else if (ctx.path && ctx.path.startsWith('/quotes')) {
        const quoteService = await ctx.container.use('quoteService')
        const quote = await quoteService.get({ id: ctx.params.id })
        if (!quote || !quote.walletAddress) {
          ctx.throw(401)
        }
        ctx.walletAddressUrl = quote.walletAddress.url
      } else {
        ctx.walletAddressUrl = `https://${ctx.request.host}/${ctx.params.walletAddressPath}`
      }
    } else if (ctx.method === 'POST') {
      if (ctx.path === `/incoming-payments/${ctx.params.id}/complete`) {
        const incomingPaymentService = await ctx.container.use(
          'incomingPaymentService'
        )
        const incomingPayment = await incomingPaymentService.get({
          id: ctx.params.id
        })
        if (!incomingPayment || !incomingPayment.walletAddress) {
          ctx.throw(401)
        }
        ctx.walletAddressUrl = incomingPayment.walletAddress.url
      } else {
        ctx.walletAddressUrl = (ctx.request.body as CreateBody).walletAddress
      }
    } else {
      ctx.throw(401)
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
