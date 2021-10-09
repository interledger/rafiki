export class CreateBalanceError extends Error {
  constructor(public code: number) {
    super()
    this.name = 'CreateBalanceError'
  }
}
