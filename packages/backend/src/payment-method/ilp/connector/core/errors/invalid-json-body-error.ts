import ExtensibleError from 'extensible-error'
import { ErrorObject } from 'ajv'

import { Errors } from 'ilp-packet'

export class InvalidJsonBodyError extends ExtensibleError {
  public ilpErrorCode: string
  public httpErrorCode = 400
  protected validationErrors: ErrorObject[]

  constructor(message: string, validationErrors: ErrorObject[]) {
    super(message)

    this.ilpErrorCode = Errors.codes.F01_INVALID_PACKET
    this.validationErrors = validationErrors
  }

  debugPrint(
    log: (message: string) => void,
    validationError?: ErrorObject
  ): void {
    if (!validationError) {
      if (this.validationErrors) {
        for (const ve of this.validationErrors) {
          this.debugPrint(log, ve)
        }
      }
      return
    }

    const additionalInfo = Object.keys(validationError.params)
      .map((key) => `${key}=${validationError.params[key]}`)
      .join(' ')

    log(
      `-- ${validationError.instancePath}: ${validationError.message}. ${additionalInfo}`
    )
  }
}
