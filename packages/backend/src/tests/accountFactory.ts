import { v4 as uuid } from 'uuid'

import { Account, AccountService, CreateOptions } from '../account/service'
import { isAccountError } from '../account/errors'
import { TransferService } from '../transfer/service'
import { randomAsset } from './asset'

type BuildOptions = Partial<CreateOptions> & {
  balance?: bigint
}

export class AccountFactory {
  public constructor(
    private accounts: AccountService,
    private transfers?: TransferService
  ) {}

  public async build(options: BuildOptions = {}): Promise<Account> {
    const accountOptions: CreateOptions = {
      id: options.id || uuid(),
      disabled: options.disabled || false,
      asset: options.asset || randomAsset(),
      stream: {
        enabled: options.stream?.enabled || false
      }
    }
    if (options.maxPacketAmount) {
      accountOptions.maxPacketAmount = options.maxPacketAmount
    }
    if (options.http) {
      accountOptions.http = options.http
    }
    if (options.routing) {
      accountOptions.routing = options.routing
    }
    const account = await this.accounts.create(accountOptions)

    if (isAccountError(account)) {
      throw new Error('unable to create account, err=' + account)
    }
    if (options.balance) {
      if (!this.transfers) {
        throw new Error('initial balance requires TransferService')
      }
      await this.transfers.create([
        {
          id: uuid(),
          sourceBalanceId: account.asset.settlementBalanceId,
          destinationBalanceId: account.balanceId,
          amount: options.balance
        }
      ])
    }

    return account
  }
}
