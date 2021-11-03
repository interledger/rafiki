import { validateId } from '../shared/utils'
import { AppContext } from '../app'
import { IAppConfig } from '../config/app'
import { PaymentPointerService } from '../payment_pointer/service'

interface ServiceDependencies {
  config: IAppConfig
  paymentPointerService: PaymentPointerService
}

export interface AccountRoutes {
  get(ctx: AppContext): Promise<void>
}

export function createAccountRoutes(deps: ServiceDependencies): AccountRoutes {
  return {
    get: (ctx: AppContext) => getAccount(deps, ctx)
  }
}

// Spec: https://docs.openpayments.dev/accounts#get
export async function getAccount(
  deps: ServiceDependencies,
  ctx: AppContext
): Promise<void> {
  const { paymentPointerId } = ctx.params
  ctx.assert(validateId(paymentPointerId), 400, 'Invalid payment pointer')
  ctx.assert(ctx.accepts('application/json'), 406)

  const paymentPointer = await deps.paymentPointerService.get(paymentPointerId)
  if (!paymentPointer) {
    ctx.throw(404)
    return // unreachable, but satisfies typescript
  }

  const config = await deps.config
  ctx.body = {
    id: `${config.publicHost}/accounts/${encodeURIComponent(paymentPointerId)}`,
    accountServicer: config.publicHost,
    assetCode: paymentPointer.asset.code,
    assetScale: paymentPointer.asset.scale
  }
}
