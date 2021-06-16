import { v4 as uuid } from 'uuid'

import { CreateOptions, IlpAccount } from '../../../core/services/accounts'
import { AccountsService } from '../../services'
import { randomAsset } from '../helpers/asset'

export class AccountFactory {
  public constructor(public accounts: AccountsService) {}

  public async build(
    options: Partial<CreateOptions> = {}
  ): Promise<IlpAccount> {
    const accountOptions: CreateOptions = {
      accountId: options.accountId || uuid(),
      disabled: options.disabled || false,
      asset: options.asset || randomAsset(),
      maxPacketAmount: options.maxPacketAmount || BigInt(100)
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
    return account
  }
}
