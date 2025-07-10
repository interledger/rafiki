export enum RouteErrorCode {
  InvalidRequest = 'invalid_request',
  InvalidClient = 'invalid_client'
}

export class POSMerchantRouteError extends Error {
  public status: number
  public code?: RouteErrorCode
  public details?: Record<string, unknown>

  constructor(
    status: number,
    message: string,
    code?: RouteErrorCode,
    details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'POSMerchantRouteError'
    this.status = status
    this.code = code ?? undefined
    this.details = details
  }
}
