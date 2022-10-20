import { ClientKeysContext } from '../app'
import { PaymentPointerService } from '../open_payments/payment_pointer/service'
import { ClientKeysService } from './service'

interface ServiceDependencies {
  clientKeysService: ClientKeysService
  paymentPointerService: PaymentPointerService
}

export interface ClientKeysRoutes {
  get(ctx: ClientKeysContext): Promise<void>
}

export function createClientKeysRoutes(
  deps: ServiceDependencies
): ClientKeysRoutes {
  return {
    get: (ctx: ClientKeysContext) => getKeyById(deps, ctx)
  }
}

export async function getKeyById(
  deps: ServiceDependencies,
  ctx: ClientKeysContext
): Promise<void> {
  const key = await deps.clientKeysService.getKeyById(ctx.params.keyId)
  if (!key) {
    ctx.throw(404)
  }

  const clientDetails = await deps.paymentPointerService.get(
    key.paymentPointerId
  )
  if (!clientDetails) {
    ctx.throw(404)
  }

  ctx.body = {
    key: key.jwk,
    paymentPointer: {
      id: clientDetails.id,
      name: clientDetails.publicName,
      uri: clientDetails.url
    }
  }
}
