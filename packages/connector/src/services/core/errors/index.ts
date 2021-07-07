import ExtensibleError from 'extensible-error'
import { Errors } from 'ilp-packet'

export * from './invalid-json-body-error'

export class AccountNotFoundError extends ExtensibleError {
  public ilpErrorCode: string
  public httpErrorCode = 400

  constructor(accountId: string) {
    super('Account not found. accountId=' + accountId)
    this.name = 'AccountNotFoundError'
    this.ilpErrorCode = Errors.codes.F02_UNREACHABLE
  }
}
