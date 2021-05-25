export class InvalidAssetError extends Error {
  constructor(code: string, scale: number) {
    super('Invalid asset. code=' + code + ' scale=' + scale)
    this.name = 'InvalidAssetError'
  }
}

export class UnknownAccountError extends Error {
  constructor() {
    super('Account not found')
    this.name = 'UnknownAccountError'
  }
}

export class UnknownBalanceError extends Error {
  constructor() {
    super('Balance not found')
    this.name = 'UnknownBalanceError'
  }
}
