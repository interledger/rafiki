import { Logger } from 'pino'
import { PaymentContext, PaymentEventEnum } from './types'
import { PaymentEventContext } from './types'
import { PaymentService, PaymentTimeoutError } from './service'
import { paymentWaitMap } from './wait-map'

interface ServiceDependencies {
  logger: Logger
  paymentService: PaymentService
}

export interface PaymentRoutes {
  create(ctx: PaymentContext): Promise<void>
  paymentEvent(ctx: PaymentEventContext): Promise<void>
}

export function createPaymentRoutes(deps: ServiceDependencies): PaymentRoutes {
  return {
    create: async (ctx: PaymentContext) => {
      try {
        const result = await deps.paymentService.create(ctx.request.body)

        switch (result.result.code) {
          case PaymentEventEnum.CardExpired:
            ctx.status = 401
            ctx.body = { error: 'Card expired' }
            return

          case PaymentEventEnum.InvalidSignature:
            ctx.status = 401
            ctx.body = { error: 'Invalid signature' }
            return
        }

        ctx.status = 201
        ctx.body = result
      } catch (err) {
        if (err instanceof PaymentTimeoutError) {
          ctx.status = err.statusCode
        } else {
          ctx.status = 500
        }
        ctx.body = {
          error: err instanceof Error ? err.message : 'Internal server error'
        }
      }
    },
    paymentEvent: async (ctx: PaymentEventContext) => {
      const body = ctx.request.body
      const deferred = paymentWaitMap.get(body.requestId)
      if (deferred) {
        deferred.resolve(body)
        ctx.status = 202
      } else {
        ctx.status = 404
        ctx.body = { error: 'No ongoing payment for this requestId' }
      }
    }
  }
}
