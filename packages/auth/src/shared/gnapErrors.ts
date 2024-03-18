import { ExtendableContext } from 'koa'

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

export function throwGNAPError(
  ctx: ExtendableContext,
  httpCode: number,
  gnapCode: GNAPErrorCode,
  description?: string
): never {
  ctx.throw(httpCode, gnapCode, { error: { code: gnapCode, description } })
}
