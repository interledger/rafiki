import { PaymentPointerKeysContext } from '../app'
import { PaymentPointerService } from '../open_payments/payment_pointer/service'
import { PaymentPointerKeyService } from './service'

interface ServiceDependencies {
  paymentPointerKeyService: PaymentPointerKeyService
  paymentPointerService: PaymentPointerService
}

export interface PaymentPointerKeysRoutes {
  get(ctx: PaymentPointerKeysContext): Promise<void>
}

export function createPaymentPointerKeysRoutes(
  deps: ServiceDependencies
): PaymentPointerKeysRoutes {
  return {
    get: (ctx: PaymentPointerKeysContext) => getKeyById(deps, ctx)
  }
}

export async function getKeyById(
  deps: ServiceDependencies,
  ctx: PaymentPointerKeysContext
): Promise<void> {
  const key = await deps.paymentPointerKeyService.getKeyById(ctx.params.keyId)
  if (!key) {
    ctx.throw(404)
  }

  const paymentPointerDetails = await deps.paymentPointerService.get(
    key.paymentPointerId
  )
  if (!paymentPointerDetails) {
    ctx.throw(404)
  }

  ctx.body = {
    key: key.jwk,
    paymentPointer: {
      id: paymentPointerDetails.id,
      name: paymentPointerDetails.publicName,
      uri: paymentPointerDetails.url
    }
  }
}
