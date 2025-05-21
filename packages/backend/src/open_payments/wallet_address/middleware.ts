import {
  GetCollectionQuery,
  SignedCollectionContext,
  WalletAddressContext,
  WalletAddressUrlContext
} from '../../app'
import { OpenPaymentsServerRouteError } from '../route-errors'
import { CreateBody as IncomingCreateBody } from '../../open_payments/payment/incoming/routes'
import { CreateBody as OutgoingCreateBody } from '../../open_payments/payment/outgoing/routes'
import { CreateBody as QuoteCreateBody } from '../../open_payments/quote/routes'

type CreateBody = IncomingCreateBody | OutgoingCreateBody | QuoteCreateBody

export async function getWalletAddressUrlFromRequestBody(
  ctx: SignedCollectionContext<CreateBody>,
  next: () => Promise<void>
) {
  ctx.walletAddressUrl = ctx.request.body.walletAddress
  await next()
}

export async function getWalletAddressUrlFromQueryParams(
  ctx: SignedCollectionContext<never, GetCollectionQuery>,
  next: () => Promise<void>
) {
  ctx.walletAddressUrl = ctx.request.query['wallet-address']
  await next()
}

export async function getWalletAddressUrlFromPath(
  ctx: WalletAddressUrlContext,
  next: () => Promise<void>
) {
  ctx.walletAddressUrl = `https://${ctx.request.host}/${ctx.params.walletAddressPath}`
  await next()
}

export async function getWalletAddressUrlFromIncomingPayment(
  ctx: WalletAddressUrlContext,
  next: () => Promise<void>
) {
  const incomingPaymentService = await ctx.container.use(
    'incomingPaymentService'
  )
  const incomingPayment = await incomingPaymentService.get({
    id: ctx.params.id,
    tenantId: ctx.params.tenantId
  })

  if (!incomingPayment?.walletAddress) {
    throw new OpenPaymentsServerRouteError(401, 'Unauthorized', {
      description: 'Failed to get wallet address from incoming payment',
      id: ctx.params.id
    })
  }

  ctx.walletAddressUrl = incomingPayment.walletAddress.address
  await next()
}

export async function getWalletAddressUrlFromOutgoingPayment(
  ctx: WalletAddressUrlContext,
  next: () => Promise<void>
) {
  const outgoingPaymentService = await ctx.container.use(
    'outgoingPaymentService'
  )
  const outgoingPayment = await outgoingPaymentService.get({
    id: ctx.params.id,
    tenantId: ctx.params.tenantId
  })

  if (!outgoingPayment?.walletAddress) {
    throw new OpenPaymentsServerRouteError(401, 'Unauthorized', {
      description: 'Failed to get wallet address from outgoing payment',
      id: ctx.params.id
    })
  }

  ctx.walletAddressUrl = outgoingPayment.walletAddress.address
  await next()
}

export async function getWalletAddressUrlFromQuote(
  ctx: WalletAddressUrlContext,
  next: () => Promise<void>
) {
  const quoteService = await ctx.container.use('quoteService')
  const quote = await quoteService.get({
    id: ctx.params.id,
    tenantId: ctx.params.tenantId
  })

  if (!quote?.walletAddress) {
    throw new OpenPaymentsServerRouteError(401, 'Unauthorized', {
      description: 'Failed to get wallet address from quote',
      id: ctx.params.id
    })
  }

  ctx.walletAddressUrl = quote.walletAddress.address
  await next()
}

export async function getWalletAddressForSubresource(
  ctx: WalletAddressContext,
  next: () => Promise<void>
) {
  const walletAddressService = await ctx.container.use('walletAddressService')

  const walletAddress = await walletAddressService.getOrPollByUrl(
    ctx.walletAddressUrl
  )

  if (!walletAddress?.isActive) {
    throw new OpenPaymentsServerRouteError(400, 'Could not get wallet address')
  }

  ctx.walletAddress = walletAddress

  await next()
}

export async function redirectIfBrowserAcceptsHtml(
  ctx: WalletAddressUrlContext,
  next: () => Promise<void>
) {
  const config = await ctx.container.use('config')
  const prefix = 'https://'

  if (
    config.walletAddressRedirectHtmlPage &&
    ctx.request.header['accept']?.includes('text/html')
  ) {
    const fullWalletAddressUrl = ctx.walletAddressUrl

    const redirectLocation = [
      { id: '%wa', fn: (s: string) => s },
      { id: '%ewa', fn: (s: string) => encodeURIComponent(s) },
      { id: '%wp', fn: (s: string) => s.replace(prefix, '') },
      {
        id: '%ewp',
        fn: (s: string) => encodeURIComponent(s.replace(prefix, ''))
      }
    ].reduce(
      (acc, { id, fn }) => acc.replace(id, fn(fullWalletAddressUrl)),
      config.walletAddressRedirectHtmlPage
    )

    ctx.set('Location', redirectLocation)
    ctx.status = 302
    return
  }

  await next()
}
