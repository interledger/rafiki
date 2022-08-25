import { PaymentPointerContext } from '../../app'
import { IAppConfig } from '../../config/app'
import { PaymentPointerService } from './service'

interface ServiceDependencies {
  config: IAppConfig
  paymentPointerService: PaymentPointerService
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
  const { accountId: paymentPointerId } = ctx.params
  const paymentPointer = await deps.paymentPointerService.get(paymentPointerId)
  if (!paymentPointer) {
    ctx.throw(404)
    return // unreachable, but satisfies typescript
  }

  const config = await deps.config
  ctx.body = {
    id: `${config.publicHost}/${encodeURIComponent(paymentPointer.id)}`,
    publicName: paymentPointer.publicName ?? undefined,
    assetCode: paymentPointer.asset.code,
    assetScale: paymentPointer.asset.scale,
    authServer: config.authServerGrantUrl
  }
}
