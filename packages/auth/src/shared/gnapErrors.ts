import { AppContext } from '../app'

export enum GNAPErrorCode {
  InvalidRequest = 'invalid_request',
  InvalidClient = 'invalid_client',
  InvalidInteraction = 'invalid_interaction',
  InvalidRotation = 'invalid_rotation',
  InvalidContinuation = 'invalid_continuation',
  UserDenied = 'user_denied',
  RequestDenied = 'request_denied',
  UnknownInteraction = 'unknown_interaction',
  TooFast = 'too_fast'
}

export interface GNAPErrorResponse {
  error: {
    code: GNAPErrorCode
    description?: string
  }
}

export class GNAPServerRouteError extends Error {
  public status: number
  public code: GNAPErrorCode

  constructor(status: number, code: GNAPErrorCode, message?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export async function gnapServerErrorMiddleware(
  ctx: AppContext,
  next: () => Promise<unknown>
) {
  try {
    await next()
  } catch (err) {
    const logger = await ctx.container.use('logger')

    const baseLog = {
      method: ctx.method,
      route: ctx.path,
      headers: ctx.headers,
      params: ctx.params,
      requestBody: ctx.request.body
    }

    if (err instanceof GNAPServerRouteError) {
      logger.info(
        {
          ...baseLog,
          message: err.message,
          requestBody: ctx.request.body
        },
        'Received error when handling GNAP request'
      )

      ctx.throw(err.status, err.code, {
        error: { code: err.code, description: err.message }
      })
    }

    logger.error(
      { ...baseLog, err },
      'Received unhandled error in GNAP request'
    )
    ctx.throw(500)
  }
}
