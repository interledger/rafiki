import { v4 as uuid } from 'uuid'

import {
  Account,
  AccountService,
  CreateOptions
} from '../tigerbeetle/account/service'
import { AssetOptions, AssetService } from '../asset/service'
import { BalanceType } from '../tigerbeetle/balance/service'
import { TransferService } from '../tigerbeetle/transfer/service'
import { randomAsset } from './asset'

type BuildOptions = Partial<CreateOptions> & {
  asset?: AssetOptions
  balance?: bigint
}

export class AccountFactory {
  public constructor(
    private accounts: AccountService,
    private assets: AssetService,
    private transfers?: TransferService
  ) {}

  public async build(options: BuildOptions = {}): Promise<Account> {
    const accountOptions: CreateOptions = {
      disabled: options.disabled || false,
      assetId: (await this.assets.getOrCreate(options.asset || randomAsset()))
        .id,
      balanceType: options.balanceType || BalanceType.Credit,
      sentBalance: options.sentBalance
    }
    const account = await this.accounts.create(accountOptions)

    if (options.balance) {
      if (!this.transfers) {
        throw new Error('initial balance requires TransferService')
      }
      const settlementAccount = await account.asset.getSettlementAccount()
      await this.transfers.create([
        {
          id: uuid(),
          sourceBalanceId: settlementAccount.balanceId,
          destinationBalanceId: account.balanceId,
          amount: options.balance
        }
      ])
    }

    return account
  }
}
