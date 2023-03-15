import { generateJwk, JWK } from '@interledger/http-signature-utils'

import { PaymentPointerKeysContext } from '../../../app'
import { IAppConfig } from '../../../config/app'
import { PaymentPointerService } from '../service'
import { PaymentPointerKeyService } from './service'

interface ServiceDependencies {
  paymentPointerKeyService: PaymentPointerKeyService
  paymentPointerService: PaymentPointerService
  config: IAppConfig
  jwk: JWK
}

export interface PaymentPointerKeyRoutes {
  getKeysByPaymentPointerId(ctx: PaymentPointerKeysContext): Promise<void>
}

export function createPaymentPointerKeyRoutes(
  deps_: Omit<ServiceDependencies, 'jwk'>
): PaymentPointerKeyRoutes {
  const deps = {
    ...deps_,
    jwk: generateJwk({
      privateKey: deps_.config.privateKey,
      keyId: deps_.config.keyId
    })
  }

  return {
    getKeysByPaymentPointerId: (ctx: PaymentPointerKeysContext) =>
      getKeysByPaymentPointerId(deps, ctx)
  }
}

export async function getKeysByPaymentPointerId(
  deps: ServiceDependencies,
  ctx: PaymentPointerKeysContext
): Promise<void> {
  if (ctx.paymentPointer) {
    const keys = await deps.paymentPointerKeyService.getKeysByPaymentPointerId(
      ctx.paymentPointer.id
    )

    ctx.body = {
      keys: keys.map((key) => key.jwk)
    }
  } else if (deps.config.paymentPointerUrl === ctx.paymentPointerUrl) {
    ctx.body = {
      keys: [deps.jwk]
    }
  } else {
    return ctx.throw(404)
  }
}
