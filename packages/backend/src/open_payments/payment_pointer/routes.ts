import { PaymentPointerContext } from '../../app'
import { IAppConfig } from '../../config/app'

interface ServiceDependencies {
  config: IAppConfig
}

export interface PaymentPointerRoutes {
  get(ctx: PaymentPointerContext): Promise<void>
}

export function createPaymentPointerRoutes(
  deps: ServiceDependencies
): PaymentPointerRoutes {
  return {
    get: (ctx: PaymentPointerContext) => getPaymentPointer(deps, ctx)
  }
}

// Spec: https://docs.openpayments.guide/reference/get-public-account
export async function getPaymentPointer(
  deps: ServiceDependencies,
  ctx: PaymentPointerContext
): Promise<void> {
  if (!ctx.paymentPointer) {
    ctx.throw(404)
    return // unreachable, but satisfies typescript
  }

  ctx.body = {
    id: ctx.paymentPointer.url,
    publicName: ctx.paymentPointer.publicName ?? undefined,
    assetCode: ctx.paymentPointer.asset.code,
    assetScale: ctx.paymentPointer.asset.scale,
    authServer: deps.config.authServerGrantUrl
  }
}
