export class UnknownApiKeyError extends Error {
  constructor(public accountId: string) {
    super('Api key not found. accountId=' + accountId)
    this.name = 'UnknownApiKeyError'
  }
}

export class NoExistingApiKeyError extends Error {
  constructor(public accountId: string) {
    super('Api keys for this account do not exist. accountId=' + accountId)
    this.name = 'NoExistingApiKeyError'
  }
}
