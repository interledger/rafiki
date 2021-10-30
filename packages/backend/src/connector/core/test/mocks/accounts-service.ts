import { AccountService, RafikiAccount } from '../../rafiki'

import { AccountTransfer } from '../../../../account/service'
import { AccountTransferError } from '../../../../account/errors'

export type MockIlpAccount = RafikiAccount & {
  balance: bigint
  http?: {
    incoming?: {
      authTokens: string[]
    }
    outgoing: {
      authToken: string
      endpoint: string
    }
  }
  staticIlpAddress?: string
}

export class MockAccountsService implements AccountService {
  private accounts: Map<string, MockIlpAccount> = new Map()

  get(accountId: string): Promise<MockIlpAccount | undefined> {
    const account = this.accounts.get(accountId)
    return Promise.resolve(account)
  }

  async getByDestinationAddress(
    destinationAddress: string
  ): Promise<MockIlpAccount | undefined> {
    const account = this.find((account) => {
      const { staticIlpAddress } = account
      if (!staticIlpAddress) return false
      return destinationAddress.startsWith(staticIlpAddress)
    })
    return account
  }

  async getByIncomingToken(token: string): Promise<MockIlpAccount | undefined> {
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

  async create(account: MockIlpAccount): Promise<RafikiAccount> {
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
    options.sourceAccount.balance -= options.sourceAmount
    return {
      commit: async () => {
        options.destinationAccount.balance +=
          options.destinationAmount ?? options.sourceAmount
      },
      rollback: async () => {
        options.sourceAccount.balance += options.sourceAmount
      }
    }
  }

  private find(
    predicate: (account: MockIlpAccount) => boolean
  ): MockIlpAccount | undefined {
    for (const [, account] of this.accounts) {
      if (predicate(account)) return account
    }
  }
}
