import { GNAPErrorCode, GNAPErrorResponse } from '../shared/gnapErrors'

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
