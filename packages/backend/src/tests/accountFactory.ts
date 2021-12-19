import { v4 as uuid } from 'uuid'

import {
  AccountingService,
  Account,
  AccountOptions
} from '../accounting/service'
import { randomUnit } from './asset'

type BuildOptions = Partial<AccountOptions> & {
  balance?: bigint
}

export class AccountFactory {
  public constructor(private accounts: AccountingService) {}

  public async build(options: BuildOptions = {}): Promise<Account> {
    const unit = options.asset?.unit || randomUnit()
    await this.accounts.createAssetAccounts(unit)
    const accountOptions: AccountOptions = {
      id: options.id || uuid(),
      asset: { unit }
    }
    const account = await this.accounts.createAccount(accountOptions)

    if (options.balance) {
      await this.accounts.createDeposit({
        id: uuid(),
        accountId: account.id,
        amount: options.balance
      })
    }

    return account
  }
}
