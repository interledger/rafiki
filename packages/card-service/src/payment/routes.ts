import {
  PaymentContext,
  PaymentEventBody,
  PaymentEventContext,
  PaymentEventType,
  PaymentCancellationReason,
  PaymentErrorCode,
  PaymentErrorResult,
  PaymentResolution,
  PaymentResult,
  PaymentResultCode
} from './types'
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
    handlePaymentEvent: (ctx: PaymentEventContext) =>
      handlePaymentEvent(deps, ctx)
  }
}

async function create(deps: ServiceDependencies, ctx: PaymentContext) {
  try {
    const result = await deps.paymentService.create(ctx.request.body)
    if (!result) {
      deps.logger.warn(
        { requestId: ctx.request.body.requestId },
        'Received empty payment result'
      )
      throw new PaymentRouteError(500, 'Missing payment result')
    }

    if (isPaymentError(result)) {
      ctx.status = 400
      ctx.body = result
      return
    }

    ctx.status = 201
    ctx.body = result
  } catch (err) {
    if (err instanceof PaymentRouteError) {
      throw err
    }

    const message = err instanceof Error ? err.message : 'Internal server error'
    throw new PaymentRouteError(500, message)
  }
}

async function handlePaymentEvent(
  deps: ServiceDependencies,
  ctx: PaymentEventContext
) {
  const body = ctx.request.body
  ctx.status = 200

  const identifiers = extractPaymentIdentifiers(body)
  if (!identifiers.requestId) {
    deps.logger.warn(
      {
        eventId: body.id,
        eventType: body.type
      },
      'Payment event missing card requestId'
    )
    return
  }

  const requestId = identifiers.requestId
  const deferred = paymentWaitMap.get(requestId)
  if (!deferred) {
    deps.logger.warn(
      {
        requestId,
        outgoingPaymentId: identifiers.outgoingPaymentId,
        eventId: body.id,
        eventType: body.type
      },
      'No ongoing payment for this requestId'
    )
    return
  }

  const resolution = toPaymentResolution(deps, body, {
    requestId,
    outgoingPaymentId: identifiers.outgoingPaymentId
  })
  deferred.resolve(resolution)
}

function toPaymentResolution(
  deps: ServiceDependencies,
  body: PaymentEventBody,
  identifiers: PaymentIdentifiers
): PaymentResolution {
  const { requestId, outgoingPaymentId } = identifiers
  const cardPaymentFailureReason = body.data.metadata?.cardPaymentFailureReason

  switch (body.type) {
    case PaymentEventType.Funded:
      return {
        requestId,
        result: {
          code: PaymentResultCode.Approved
        }
      }
    case PaymentEventType.Cancelled: {
      if (
        cardPaymentFailureReason === PaymentCancellationReason.InvalidSignature
      ) {
        return {
          requestId,
          result: {
            code: PaymentResultCode.InvalidSignature,
            description: 'Invalid card signature'
          }
        }
      }

      const description = `Card payment failure reason "${cardPaymentFailureReason ?? 'unknown'}" for cancelled payment request "${requestId}" and outgoing payment "${outgoingPaymentId ?? 'unknown'}"`
      deps.logger.warn(
        {
          requestId,
          outgoingPaymentId,
          eventId: body.id,
          eventType: body.type,
          cardPaymentFailureReason
        },
        description
      )
      return {
        error: {
          code: PaymentErrorCode.InvalidRequest,
          description
        }
      }
    }
    default: {
      const description = `Payment event type "${body.type}" is not supported for request "${requestId}" and outgoing payment "${outgoingPaymentId ?? 'unknown'}"`
      deps.logger.warn(
        {
          requestId,
          outgoingPaymentId,
          eventId: body.id,
          eventType: body.type
        },
        description
      )
      return {
        error: {
          code: PaymentErrorCode.InvalidRequest,
          description
        }
      }
    }
  }
}

interface PaymentIdentifiers {
  requestId: string
  outgoingPaymentId?: string
}

function extractPaymentIdentifiers(body: PaymentEventBody): {
  requestId?: string
  outgoingPaymentId?: string
} {
  return {
    requestId: body.data?.cardDetails?.requestId,
    outgoingPaymentId: body.data?.id
  }
}

function isPaymentError(result: PaymentResult): result is PaymentErrorResult {
  return Boolean(result && 'error' in result)
}
