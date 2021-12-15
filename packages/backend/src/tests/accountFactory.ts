import assert from 'assert'
import { v4 as uuid } from 'uuid'

import {
  AccountingService,
  AccountOptions,
  AccountType,
  AssetAccount,
  CreateOptions
} from '../accounting/service'
import { randomUnit } from './asset'

type BuildOptions = {
  id?: string
  asset?: {
    unit: number
  }
  type?: AccountType
  receiveLimit?: bigint
  balance?: bigint
}

export class AccountFactory {
  public constructor(private accounts: AccountingService) {}

  public async build(options: BuildOptions = {}): Promise<AccountOptions> {
    const id = options.id || uuid()
    const type =
      options.receiveLimit !== undefined
        ? AccountType.Receive
        : options.type || AccountType.Liquidity
    const unit = options.asset?.unit || randomUnit()
    await this.accounts.createAssetAccounts(unit)

    let accountOptions: CreateOptions
    if (type === AccountType.Liquidity) {
      accountOptions = {
        id,
        asset: { unit },
        type: AccountType.Liquidity
      }
    } else {
      accountOptions = {
        id,
        receiveLimit: options.receiveLimit,
        type
      }
    }
    const account = await this.accounts.createAccount(accountOptions)

    if (options.balance) {
      assert.ok(account.type === AccountType.Liquidity)
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

    return {
      ...account,
      asset: { unit }
    }
  }
}
