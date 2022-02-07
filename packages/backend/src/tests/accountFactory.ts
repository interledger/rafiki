import { v4 as uuid } from 'uuid'

import {
  AccountingService,
  LiquidityAccount,
  TransferAccount
} from '../accounting/service'
import { randomUnit } from './asset'

type BuildOptions = Partial<LiquidityAccount> & {
  balance?: bigint
}

export class AccountFactory {
  public constructor(
    private accounts: AccountingService,
    private unitGenerator: () => number = randomUnit
  ) {}

  public async build(options: BuildOptions = {}): Promise<TransferAccount> {
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
      await this.accounts.createLiquidityAccount(asset)
    }
    const account = {
      id: options.id || uuid(),
      asset
    }
    await this.accounts.createLiquidityAccount(account)

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
