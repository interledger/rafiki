import { PaymentPointerContext } from '../app'
import { PaymentPointerService } from '../open_payments/payment_pointer/service'
import { PaymentPointerKeyService } from './service'

interface ServiceDependencies {
  paymentPointerKeyService: PaymentPointerKeyService
  paymentPointerService: PaymentPointerService
}

export interface PaymentPointerKeyRoutes {
  getKeysByPaymentPointerId(ctx: PaymentPointerContext): Promise<void>
}

export function createPaymentPointerKeyRoutes(
  deps: ServiceDependencies
): PaymentPointerKeyRoutes {
  return {
    getKeysByPaymentPointerId: (ctx: PaymentPointerContext) =>
      getKeysByPaymentPointerId(deps, ctx)
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
