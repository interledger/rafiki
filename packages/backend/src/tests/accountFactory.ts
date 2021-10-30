import { v4 as uuid } from 'uuid'

import { Account, AccountService, CreateOptions } from '../account/service'
import { AssetOptions, AssetService } from '../asset/service'
import { TransferService } from '../transfer/service'
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
      stream: {
        enabled: options.stream?.enabled || false
      },
      sentBalance: options.sentBalance
    }
    if (options.maxPacketAmount) {
      accountOptions.maxPacketAmount = options.maxPacketAmount
    }
    const account = await this.accounts.create(accountOptions)

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
