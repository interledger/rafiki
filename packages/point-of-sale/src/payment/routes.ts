import { AppContext } from '../app'
import { BaseService } from '../shared/baseService'

interface ServiceDependencies extends BaseService {}

export type PaymentBody = {
  card: {
    walletAddress: string
    trasactionCounter: number
    expiry: Date
  }
  signature: string
}
type PaymentRequest = Exclude<AppContext['request'], 'body'> & {
  body: PaymentBody
}

export type PaymentContext = Exclude<AppContext, 'request'> & {
  request: PaymentRequest
}

export interface PaymentRoutes {
  payment(ctx: PaymentContext): Promise<void>
}

export function createPaymentRoutes(deps_: ServiceDependencies): PaymentRoutes {
  const log = deps_.logger.child({
    service: 'PaymentRoutes'
  })

  const deps = {
    ...deps_,
    logger: log
  }

  return {
    payment: (ctx: PaymentContext) => payment(deps, ctx)
  }
}

function payment(
  deps: ServiceDependencies,
  ctx: PaymentContext
): Promise<void> {
  // 1. Get the walletAddress by walletAddressUrl

  // 2. Call Rafiki BE to create an incoming payment
  //    ! will be defined => incomingPaymentUrl
  const incomingPaymentUrl = ''
  // 3. Call card service client

  throw new Error('')
}
