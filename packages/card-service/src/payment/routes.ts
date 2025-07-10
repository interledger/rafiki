import {
  PaymentContext,
  PaymentEventResultEnum,
  PaymentResultEnum
} from './types'
import { PaymentEventContext } from './types'
import { PaymentService } from './service'
import { paymentWaitMap } from './wait-map'
import { BaseService } from '../shared/baseService'
import { PaymentRouteError } from './errors'

interface ServiceDependencies extends BaseService {
  paymentService: PaymentService
}

export interface PaymentRoutes {
  create(ctx: PaymentContext): Promise<void>
  handlePaymentEvent(ctx: PaymentEventContext): Promise<void>
}

export function createPaymentRoutes(deps: ServiceDependencies): PaymentRoutes {
  return {
    create: (ctx: PaymentContext) => create(deps, ctx),
    handlePaymentEvent: (ctx: PaymentEventContext) => handlePaymentEvent(ctx)
  }
}

async function create(deps: ServiceDependencies, ctx: PaymentContext) {
  try {
    const result = await deps.paymentService.create(ctx.request.body)

    switch (result.result.code) {
      case PaymentEventResultEnum.CardExpired:
        throw new PaymentRouteError(401, 'Card expired')

      case PaymentEventResultEnum.InvalidSignature:
        throw new PaymentRouteError(401, 'Invalid signature')
    }

    ctx.status = 201
    ctx.body = { result: PaymentResultEnum.Approved }
  } catch (err) {
    if (err instanceof PaymentRouteError) {
      throw err
    }

    const message = err instanceof Error ? err.message : 'Internal server error'
    throw new PaymentRouteError(500, message)
  }
}

async function handlePaymentEvent(ctx: PaymentEventContext) {
  const body = ctx.request.body
  const deferred = paymentWaitMap.get(body.requestId)
  if (deferred) {
    deferred.resolve(body)
    ctx.status = 202
  } else {
    throw new PaymentRouteError(404, 'No ongoing payment for this requestId')
  }
}
