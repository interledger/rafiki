import { v4 as uuid } from 'uuid'

import {
  Account,
  AccountService,
  AccountType,
  AssetAccount,
  CreateOptions
} from '../tigerbeetle/account/service'
import { TransferService } from '../tigerbeetle/transfer/service'
import { randomUnit } from './asset'

type BuildOptions = Partial<CreateOptions> & {
  balance?: bigint
}

export class AccountFactory {
  public constructor(
    private accounts: AccountService,
    private transfers?: TransferService
  ) {}

  public async build(options: BuildOptions = {}): Promise<Account> {
    const unit = options.asset?.unit || randomUnit()
    await this.accounts.createAssetAccounts(unit)
    const accountOptions: CreateOptions = {
      asset: { unit },
      type: options.type || AccountType.Credit,
      sentBalance: options.sentBalance,
      receiveLimit: options.receiveLimit
    }
    const account = await this.accounts.create(accountOptions)

    if (options.balance) {
      if (!this.transfers) {
        throw new Error('initial balance requires TransferService')
      }
      await this.transfers.create([
        {
          id: uuid(),
          sourceAccount: {
            asset: {
              unit,
              account: AssetAccount.Settlement
            }
          },
          destinationAccount: account,
          amount: options.balance
        }
      ])
    }

    return account
  }
}
