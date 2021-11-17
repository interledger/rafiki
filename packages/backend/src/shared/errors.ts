import { AccountOptions } from '../tigerbeetle/account/service'
import { TransferError } from '../tigerbeetle/transfer/errors'

export class BalanceTransferError extends Error {
  constructor(public error: TransferError) {
    super()
    this.name = 'TransferError'
  }
}

export class UnknownAccountError extends Error {
  constructor(account: AccountOptions) {
    super('Account not found. account=' + JSON.stringify(account))
    this.name = 'UnknownAccountError'
  }
}
