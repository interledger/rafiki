import { v4 as uuid } from 'uuid'

import {
  AccountingService,
  LiquidityAccount,
  LiquidityAccountType
} from '../accounting/service'
import { randomLedger } from './asset'

type BuildOptions = Partial<LiquidityAccount> & {
  balance?: bigint
  type?: LiquidityAccountType
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
      await this.accounts.createLiquidityAndLinkedSettlementAccount(
        asset,
        LiquidityAccountType.ASSET
      )
    }
    const account = {
      id: options.id || uuid(),
      asset
    }
    await this.accounts.createLiquidityAccount(
      account,
      options?.type || LiquidityAccountType.INCOMING
    )

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
