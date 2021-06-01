export * from './invalid-json-body-error'

export class AccountNotFoundError extends Error {
  constructor(accountId: string) {
    super('Account not found. accountId=' + accountId)
    this.name = 'AccountNotFoundError'
  }
}
