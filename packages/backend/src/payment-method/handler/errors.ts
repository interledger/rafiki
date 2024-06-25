interface ErrorDetails {
  description: string
  retryable?: boolean
  code?: PaymentMethodHandlerErrorCode
}

export enum PaymentMethodHandlerErrorCode {
  QuoteNonPositiveReceiveAmount = 'QuoteNonPositiveReceiveAmount'
}

export class PaymentMethodHandlerError extends Error {
  public description: string
  public retryable?: boolean
  public code?: PaymentMethodHandlerErrorCode

  constructor(message: string, args: ErrorDetails) {
    super(message)
    this.name = 'PaymentMethodHandlerError'
    this.description = args.description
    this.retryable = args.retryable
    this.code = args.code
  }
}
