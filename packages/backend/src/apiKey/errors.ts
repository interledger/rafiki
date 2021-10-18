export class UnknownApiKeyError extends Error {
  constructor(public accountId: string) {
    super('Api key not found. accountId=' + accountId)
    this.name = 'UnknownApiKeyError'
  }
}
