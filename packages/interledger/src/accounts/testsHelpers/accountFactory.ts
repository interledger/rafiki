import { v4 as uuid } from 'uuid'

import {
  AccountsService,
  CreateOptions,
  CreateSubAccountOptions,
  IlpAccount
} from '../types'
import { randomAsset } from './asset'

export function isSubAccount(
  account: Partial<CreateOptions>
): account is CreateSubAccountOptions {
  return (account as CreateSubAccountOptions).superAccountId !== undefined
}

export class AccountFactory {
  public constructor(public accounts: AccountsService) {}

  public async build(
    options: Partial<CreateOptions> = {}
  ): Promise<IlpAccount> {
    let accountOptions: CreateOptions
    if (isSubAccount(options)) {
      accountOptions = {
        accountId: options.accountId || uuid(),
        disabled: options.disabled || false,
        superAccountId: options.superAccountId
      }
    } else {
      accountOptions = {
        accountId: options.accountId || uuid(),
        disabled: options.disabled || false,
        asset: options.asset || randomAsset()
      }
    }
    if (options.maxPacketAmount) {
      accountOptions.maxPacketAmount = options.maxPacketAmount
    }
    if (options.stream) {
      accountOptions.stream = options.stream
    }
    if (options.http) {
      accountOptions.http = options.http
    }
    if (options.routing) {
      accountOptions.routing = options.routing
    }
    const account = await this.accounts.createAccount(accountOptions)
    return account as IlpAccount
  }
}
