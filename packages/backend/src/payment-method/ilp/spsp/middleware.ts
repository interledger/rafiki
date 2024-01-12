import { WalletAddressContext, SPSPContext } from '../../../app'

export type SPSPWalletAddressContext = WalletAddressContext &
  SPSPContext & {
    incomingPayment?: never
  }

export const spspMiddleware = async (
  ctx: SPSPWalletAddressContext,
  next: () => Promise<unknown>
): Promise<void> => {
  // Fall back to legacy protocols if client doesn't support Open Payments.
  if (ctx.accepts('application/spsp4+json')) {
    const receiver = ctx.walletAddress ?? ctx.incomingPayment
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
