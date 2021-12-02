import {
  AccountingService,
  Account,
  AccountType,
  AssetAccount,
  CreateOptions
} from '../accounting/service'
import { randomUnit } from './asset'

type BuildOptions = Partial<CreateOptions> & {
  balance?: bigint
}

export class AccountFactory {
  public constructor(private accounts: AccountingService) {}

  public async build(options: BuildOptions = {}): Promise<Account> {
    const unit = options.asset?.unit || randomUnit()
    await this.accounts.createAssetAccounts(unit)
    const accountOptions: CreateOptions = {
      asset: { unit },
      type: options.type || AccountType.Credit
    }
    const account = await this.accounts.createAccount(accountOptions)

    if (options.balance) {
      await this.accounts.createTransfer({
        sourceAccount: {
          asset: {
            unit,
            account: AssetAccount.Settlement
          }
        },
        destinationAccount: account,
        amount: options.balance
      })
    }

    return account
  }
}
