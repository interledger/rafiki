import { PaymentPointerKeyContext } from '../app'
import { PaymentPointerService } from '../open_payments/payment_pointer/service'
import { PaymentPointerKeyService } from './service'

interface ServiceDependencies {
  paymentPointerKeyService: PaymentPointerKeyService
  paymentPointerService: PaymentPointerService
}

export interface PaymentPointerKeyRoutes {
  get(ctx: PaymentPointerKeyContext): Promise<void>
}

export function createPaymentPointerKeyRoutes(
  deps: ServiceDependencies
): PaymentPointerKeyRoutes {
  return {
    get: (ctx: PaymentPointerKeyContext) => getKeyById(deps, ctx)
  }
}

export async function getKeyById(
  deps: ServiceDependencies,
  ctx: PaymentPointerKeyContext
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
