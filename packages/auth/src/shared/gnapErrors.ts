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

interface GNAPErrorResponse {
  error: {
    code: GNAPErrorCode
    description?: string
  }
}

export function generateGNAPErrorResponse(
  code: GNAPErrorCode,
  description?: string
): GNAPErrorResponse {
  return {
    error: {
      code,
      description
    }
  }
}
