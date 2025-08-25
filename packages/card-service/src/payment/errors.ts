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

export class PaymentTimeoutError extends PaymentRouteError {
  constructor(message = 'Timeout waiting for payment-event') {
    super(504, message)
  }
}

export class UnknownWalletAddressError extends PaymentRouteError {
  constructor(message = 'Unknown wallet address') {
    super(404, message)
  }
}

export class PaymentCreationFailedError extends PaymentRouteError {
  constructor(message = 'Failed to create outgoing payment') {
    super(500, message)
  }
}
