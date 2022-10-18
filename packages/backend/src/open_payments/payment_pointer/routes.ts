import { ClientService } from '../../clients/service'
import { PaymentPointerContext } from '../../app'
import { IAppConfig } from '../../config/app'

interface ServiceDependencies {
  clientService: ClientService
  config: IAppConfig
}

export interface PaymentPointerRoutes {
  get(ctx: PaymentPointerContext): Promise<void>
  getKeys(ctx: PaymentPointerContext): Promise<void>
}

export function createPaymentPointerRoutes(
  deps: ServiceDependencies
): PaymentPointerRoutes {
  return {
    get: (ctx: PaymentPointerContext) => getPaymentPointer(deps, ctx),
    getKeys: (ctx: PaymentPointerContext) => getPaymentPointerKeys(deps, ctx)
  }
}

// Spec: https://docs.openpayments.guide/reference/get-public-account
export async function getPaymentPointer(
  deps: ServiceDependencies,
  ctx: PaymentPointerContext
): Promise<void> {
  if (!ctx.paymentPointer) {
    return ctx.throw(404)
  }

  ctx.body = {
    id: ctx.paymentPointer.url,
    publicName: ctx.paymentPointer.publicName ?? undefined,
    assetCode: ctx.paymentPointer.asset.code,
    assetScale: ctx.paymentPointer.asset.scale,
    authServer: deps.config.authServerGrantUrl
  }
}

export async function getPaymentPointerKeys(
  deps: ServiceDependencies,
  ctx: PaymentPointerContext
): Promise<void> {
  if (!ctx.paymentPointer) {
    return ctx.throw(404)
  }

  const client = await deps.clientService
    .getClientByPaymentPointerUrl(ctx.paymentPointer.url)
    .catch(() => ctx.throw('Client not found', 404))

  const jwks = client.keys.map((key) => key.jwk)

  ctx.body = jwks
}
