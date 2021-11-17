import { AccountService, RafikiAccount } from '../../rafiki'

import { AccountTransfer } from '../../../../tigerbeetle/account/service'
import { AccountTransferError } from '../../../../tigerbeetle/account/errors'

export type MockIlpAccount = RafikiAccount & {
  balance: bigint
  http?: {
    incoming?: {
      authTokens: string[]
    }
  }
  active?: boolean
}

export class MockAccountsService implements AccountService {
  private accounts: Map<string, MockIlpAccount> = new Map()

  _get(accountId: string): Promise<RafikiAccount | undefined> {
    const account = this.accounts.get(accountId)
    return Promise.resolve(account)
  }

  async _getByDestinationAddress(
    destinationAddress: string
  ): Promise<RafikiAccount | undefined> {
    const account = this.find((account) => {
      const { staticIlpAddress } = account
      if (!staticIlpAddress) return false
      return destinationAddress.startsWith(staticIlpAddress)
    })
    return account
  }

  async _getByIncomingToken(token: string): Promise<RafikiAccount | undefined> {
    return this.find(
      (account) => !!account.http?.incoming?.authTokens.includes(token)
    )
  }

  async getBalance(accountId: string): Promise<bigint | undefined> {
    const account = this.accounts.get(accountId)
    if (account) {
      return account.balance
    }
  }

  async getReceiveLimit(accountId: string): Promise<bigint | undefined> {
    const account = this.accounts.get(accountId)
    if (account?.receiveLimit != null) {
      return account.receiveLimit
    }
  }

  async create(account: MockIlpAccount): Promise<RafikiAccount> {
    if (!account.id) throw new Error('unexpected asset account')
    this.accounts.set(account.id, account)
    return account
  }

  async transferFunds(options: {
    sourceAccount: MockIlpAccount
    destinationAccount: MockIlpAccount
    sourceAmount: bigint
    destinationAmount: bigint
    timeout: bigint
  }): Promise<AccountTransfer | AccountTransferError> {
    if (options.sourceAccount.balance < options.sourceAmount) {
      return AccountTransferError.InsufficientBalance
    }
    if (
      options.destinationAccount.receiveLimit != null &&
      options.destinationAccount.receiveLimit <
        (options.destinationAmount || options.sourceAmount)
    ) {
      return AccountTransferError.ReceiveLimitExceeded
    }
    options.sourceAccount.balance -= options.sourceAmount
    return {
      commit: async () => {
        options.destinationAccount.balance +=
          options.destinationAmount ?? options.sourceAmount
        if (options.destinationAccount.receiveLimit != null) {
          options.destinationAccount.receiveLimit -=
            options.destinationAmount ?? options.sourceAmount
        }
      },
      rollback: async () => {
        options.sourceAccount.balance += options.sourceAmount
      }
    }
  }

  private find(
    predicate: (account: MockIlpAccount) => boolean
  ): RafikiAccount | undefined {
    for (const [, account] of this.accounts) {
      if (predicate(account)) return account
    }
  }
}
