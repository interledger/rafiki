import { v4 as uuid } from 'uuid'

import { AccountingService, LiquidityAccount } from '../accounting/service'
import { randomLedger } from './asset'

type BuildOptions = Partial<LiquidityAccount> & {
  balance?: bigint
}

export type FactoryAccount = Omit<LiquidityAccount, 'asset'> & {
  asset: {
    id: string
    ledger: number
    asset: {
      id: string
      ledger: number
    }
  }
}

export class AccountFactory {
  public constructor(
    private accounts: AccountingService,
    private ledgerGenerator: () => number = randomLedger
  ) {}

  public async build(options: BuildOptions = {}): Promise<FactoryAccount> {
    const assetId = options.asset?.id || uuid()
    const ledger = options.asset?.ledger || this.ledgerGenerator()
    const asset = {
      id: assetId,
      ledger,
      asset: {
        id: assetId,
        ledger
      }
    }
    if (!options.asset) {
      await this.accounts.createSettlementAccount(asset.ledger)
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
