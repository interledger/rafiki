export class CreateBalanceError extends Error {
  constructor(public code: number) {
    super()
    this.name = 'CreateBalanceError'
  }
}

export enum BalanceError {
  DuplicateBalance = 'DuplicateBalance'
}

export type CreateBalancesError = {
  index: number
  error: BalanceError
}
