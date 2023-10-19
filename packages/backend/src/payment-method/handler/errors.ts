interface ErrorDetails {
  description: string
  retryable?: boolean
}

export class PaymentMethodHandlerError extends Error {
  public description: string
  public retryable?: boolean

  constructor(message: string, args: ErrorDetails) {
    super(message)
    this.name = 'PaymentMethodHandlerError'
    this.description = args.description
    this.retryable = args.retryable
  }
}
