export class UnknownAssetError extends Error {
  constructor(public accountId: string) {
    super('Asset not found. accountId=' + accountId)
    this.name = 'UnknownAssetError'
  }
}
