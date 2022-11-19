import { JWK } from 'open-payments'

import { PaymentPointerContext } from '../app'
import { IAppConfig } from '../config/app'
import { PaymentPointerService } from '../open_payments/payment_pointer/service'
import { PaymentPointerKeyService } from './service'

interface ServiceDependencies {
  paymentPointerKeyService: PaymentPointerKeyService
  paymentPointerService: PaymentPointerService
  config: IAppConfig
  jwk: JWK
}

export interface PaymentPointerKeyRoutes {
  getKeysByPaymentPointerId(ctx: PaymentPointerContext): Promise<void>
}

export function createPaymentPointerKeyRoutes(
  deps_: Omit<ServiceDependencies, 'jwk'>
): PaymentPointerKeyRoutes {
  const deps = {
    ...deps_,
    jwk: {
      ...deps_.config.privateKey.export({ format: 'jwk' }),
      kid: deps_.config.keyId,
      alg: 'EdDSA'
    } as JWK
  }

  return {
    getKeysByPaymentPointerId: (ctx: PaymentPointerContext) =>
      getKeysByPaymentPointerId(deps, ctx)
  }
}

export async function getKeysByPaymentPointerId(
  deps: ServiceDependencies,
  ctx: PaymentPointerContext
): Promise<void> {
  if (ctx.paymentPointer) {
    const keys = await deps.paymentPointerKeyService.getKeysByPaymentPointerId(
      ctx.paymentPointer.id
    )

    ctx.body = {
      keys: keys.map((key) => key.jwk)
    }
  } else if (
    deps.config.paymentPointerUrl ===
    `https://${ctx.request.host}/${ctx.params.paymentPointerPath}`
  ) {
    ctx.body = {
      keys: [deps.jwk]
    }
  } else {
    return ctx.throw(404)
  }
}
