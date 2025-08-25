export class PaymentRouteError extends Error {
  public status: number
  public details?: Record<string, unknown>

  constructor(
    status: number,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'PaymentRouteError'
    this.status = status
    this.details = details
  }
}

export class InvalidCardPaymentError extends PaymentRouteError {
  constructor(message = 'Invalid card payment') {
    super(401, message)
  }
}

export class IncomingPaymentEventTimeoutError extends PaymentRouteError {
  constructor(message = 'Timed out waiting for incoming payment event') {
    super(504, message)
  }
}
