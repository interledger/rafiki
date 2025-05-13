import { AppContext } from '../app'
import { OpenAPIValidatorMiddlewareError } from '@interledger/openapi'
import { SPSPRouteError } from '../payment-method/ilp/spsp/middleware'

export class OpenPaymentsServerRouteError extends Error {
  public status: number
  public details?: Record<string, unknown>

  constructor(
    status: number,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'OpenPaymentsServerRouteError'
    this.status = status
    this.details = details
  }
}

export async function openPaymentsServerErrorMiddleware(
  ctx: AppContext,
  next: () => Promise<unknown>
) {
  try {
    await next()
  } catch (err) {
    const logger = await ctx.container.use('logger')

    const baseLog = {
      method: ctx.req.method,
      path: ctx.path
    }

    if (err instanceof OpenPaymentsServerRouteError) {
      logger.info(
        {
          ...baseLog,
          message: err.message,
          details: err.details,
          status: err.status,
          requestBody: ctx.request.body
        },
        'Received error when handling Open Payments request'
      )

      ctx.status = err.status
      ctx.body = {
        error: {
          code: `${err.status}`,
          description: err.message,
          details: err.details
        }
      }
      return
    }

    if (err instanceof OpenAPIValidatorMiddlewareError) {
      const finalStatus = err.status || 400

      logger.info(
        {
          ...baseLog,
          message: err.message,
          status: finalStatus
        },
        'Received OpenAPI validation error when handling Open Payments request'
      )

      ctx.status = finalStatus
      ctx.body = {
        error: {
          code: `${finalStatus}`,
          description: err.message
        }
      }
      return
    }

    if (err instanceof SPSPRouteError) {
      logger.info(
        {
          ...baseLog,
          message: err.message,
          details: err.details
        },
        'Received error when handling SPSP request'
      )

      ctx.status = err.status
      ctx.body = {
        error: {
          code: `${err.status}`,
          description: err.message,
          details: err.details
        }
      }
      return
    }

    logger.error(
      { ...baseLog, err },
      'Received unhandled error in Open Payments request'
    )
    ctx.throw(500)
  }
}
