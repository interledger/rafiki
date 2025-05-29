interface ErrorDetails {
  description: string
  retryable?: boolean
  code?: PaymentMethodHandlerErrorCode
  details?: Record<string, unknown>
}

export enum PaymentMethodHandlerErrorCode {
  QuoteNonPositiveReceiveAmount = 'QuoteNonPositiveReceiveAmount'
}

export class PaymentMethodHandlerError extends Error {
  public description: string
  public retryable?: boolean
  public code?: PaymentMethodHandlerErrorCode
  public details?: Record<string, unknown>

  constructor(message: string, args: ErrorDetails) {
    super(message)
    this.name = 'PaymentMethodHandlerError'
    this.description = args.description
    this.retryable = args.retryable
    this.code = args.code
    this.details = args.details
  }
}
