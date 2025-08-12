export class POSMerchantError extends Error {
  public status: number
  public details?: Record<string, unknown>

  constructor(
    status: number,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'POSMerchantError'
    this.status = status
    this.details = details
  }
}
