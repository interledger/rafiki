import { AccountService, RafikiAccount } from '../../rafiki'

import {
  Transfer,
  TransferError
} from '../../../../account/service'

export type MockIlpAccount = RafikiAccount & {
  balance: bigint
  http?: {
    incoming?: {
      authTokens: string[]
    }
  }
}

export class MockAccountsService implements AccountService {
  private accounts: Map<string, MockIlpAccount> = new Map()

  constructor(private serverIlpAddress: string) {}

  get(accountId: string): Promise<RafikiAccount | undefined> {
    const account = this.accounts.get(accountId)
    return Promise.resolve(account)
  }

  async getByDestinationAddress(
    destinationAddress: string
  ): Promise<RafikiAccount | undefined> {
    const account = this.find((account) => {
      const { routing } = account
      if (!routing) return false
      return destinationAddress.startsWith(routing.staticIlpAddress)
      //routing.staticIlpAddress === destinationAddress ||
      //routing.prefixes.some((prefix) => destinationAddress.startsWith(prefix))
    })
    return account
  }

  async getByToken(token: string): Promise<RafikiAccount | undefined> {
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
    sourceAccount: MockIlpAccount,
    destinationAccount: MockIlpAccount,
    sourceAmount: bigint,
    destinationAmount: bigint
  }): Promise<Transfer | TransferError> {
    if (options.sourceAccount.balance < options.sourceAmount) {
      return TransferError.InsufficientBalance
    }
    options.sourceAccount.balance -= options.sourceAmount
    return {
      commit: async () => {
        options.destinationAccount.balance += options.destinationAmount ?? options.sourceAmount
      },
      rollback: async () => {
        options.sourceAccount.balance += options.sourceAmount
      }
    }
  }

  async getAddress(accountId: string): Promise<string | undefined> {
    const account = this.accounts.get(accountId)
    if (!account) return undefined
    if (account.routing) {
      return account.routing.staticIlpAddress
    } else {
      return this.serverIlpAddress + '.' + accountId
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
