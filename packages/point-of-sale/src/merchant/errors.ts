export enum RouteErrorCode {
  InvalidSignature = 'invalid_signature',
  InvalidClient = 'invalid_client'
}

export class MerchantRouteError extends Error {
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
    this.name = 'MerchantRouteError'
    this.status = status
    this.code = code ?? undefined
    this.details = details
  }
}
