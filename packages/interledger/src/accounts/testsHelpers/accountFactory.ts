import { v4 as uuid } from 'uuid'

import { AccountsService, CreateOptions, IlpAccount } from '../types'
import { randomAsset } from './asset'

export class AccountFactory {
  public constructor(public accounts: AccountsService) {}

  public async build(
    options: Partial<CreateOptions> = {}
  ): Promise<IlpAccount> {
    const accountOptions: CreateOptions = {
      accountId: options.accountId || uuid(),
      disabled: options.disabled || false,
      asset: options.asset || randomAsset()
    }
    if (options.superAccountId) {
      accountOptions.superAccountId = options.superAccountId
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
