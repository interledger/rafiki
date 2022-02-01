import { v4 as uuid } from 'uuid'

import { AccountingService, Account } from '../accounting/service'
import { randomUnit } from './asset'

type BuildOptions = Partial<Account> & {
  balance?: bigint
}

export type FactoryAccount = Omit<Account, 'asset'> & {
  asset: {
    id: string
    unit: number
    asset: {
      id: string
      unit: number
    }
  }
}

export class AccountFactory {
  public constructor(
    private accounts: AccountingService,
    private unitGenerator: () => number = randomUnit
  ) {}

  public async build(options: BuildOptions = {}): Promise<FactoryAccount> {
    const assetId = options.asset?.id || uuid()
    const unit = options.asset?.unit || this.unitGenerator()
    const asset = {
      id: assetId,
      unit,
      asset: {
        id: assetId,
        unit
      }
    }
    if (!options.asset) {
      await this.accounts.createSettlementAccount(asset.unit)
      await this.accounts.createAccount(asset)
    }
    const account = {
      id: options.id || uuid(),
      asset
    }
    await this.accounts.createAccount(account)

    if (options.balance) {
      await this.accounts.createDeposit({
        id: uuid(),
        account,
        amount: options.balance
      })
    }

    return account
  }
}
