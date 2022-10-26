import { PaymentPointerContext, PaymentPointerKeyContext } from '../app'
import { PaymentPointerService } from '../open_payments/payment_pointer/service'
import { PaymentPointerKeyService } from './service'

interface ServiceDependencies {
  paymentPointerKeyService: PaymentPointerKeyService
  paymentPointerService: PaymentPointerService
}

export interface PaymentPointerKeyRoutes {
  get(ctx: PaymentPointerKeyContext): Promise<void>
  getKeysByPaymentPointerId(ctx: PaymentPointerContext): Promise<void>
}

export function createPaymentPointerKeyRoutes(
  deps: ServiceDependencies
): PaymentPointerKeyRoutes {
  return {
    get: (ctx: PaymentPointerKeyContext) => getKeyById(deps, ctx),
    getKeysByPaymentPointerId: (ctx: PaymentPointerContext) =>
      getKeysByPaymentPointerId(deps, ctx)
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

export async function getKeysByPaymentPointerId(
  deps: ServiceDependencies,
  ctx: PaymentPointerContext
): Promise<void> {
  if (!ctx.paymentPointer) {
    return ctx.throw(404)
  }

  const keys = await deps.paymentPointerKeyService.getKeysByPaymentPointerId(
    ctx.paymentPointer.id
  )

  ctx.body = keys.map((key) => key.jwk)
}
