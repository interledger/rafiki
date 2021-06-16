import {
  AccountError,
  AccountsService,
  CreateOptions,
  IlpAccount,
  IlpBalance,
  Transaction,
  Transfer
} from '../../services'

type MockIlpAccount = CreateOptions & {
  disabled: boolean
  balance: bigint
}

export class MockAccountsService implements AccountsService {
  private accounts: Map<string, MockIlpAccount> = new Map()

  constructor(private serverIlpAddress: string) {}

  getAccount(accountId: string): Promise<IlpAccount | null> {
    const account = this.accounts.get(accountId)
    return Promise.resolve(account || null)
  }

  async getAccountByDestinationAddress(
    destinationAddress: string
  ): Promise<IlpAccount | null> {
    const account = this.find((account) => {
      const { routing } = account
      if (!routing) return false
      return destinationAddress.startsWith(routing.staticIlpAddress)
      //routing.staticIlpAddress === destinationAddress ||
      //routing.prefixes.some((prefix) => destinationAddress.startsWith(prefix))
    })
    return account || null
  }

  async getAccountByToken(token: string): Promise<IlpAccount | null> {
    return this.find(
      (account) => !!account.http?.incoming?.authTokens.includes(token)
    )
  }

  async getAccountBalance(accountId: string): Promise<IlpBalance | null> {
    const account = this.accounts.get(accountId)
    if (account) {
      return {
        id: accountId,
        balance: account.balance
      }
    } else {
      return null
    }
  }

  async createAccount(
    account: MockIlpAccount
  ): Promise<IlpAccount | AccountError> {
    this.accounts.set(account.accountId, account)
    return account
  }

  async transferFunds(options: Transfer): Promise<Transaction | AccountError> {
    const src = this.accounts.get(options.sourceAccountId)
    if (!src) return AccountError.UnknownSourceAccount
    const dst = this.accounts.get(options.destinationAccountId)
    if (!dst) return AccountError.UnknownDestinationAccount
    if (src.asset.code !== dst.asset.code)
      throw new Error('asset code mismatch')
    if (src.asset.scale !== dst.asset.scale)
      throw new Error('asset scale mismatch')
    if (src.balance < options.sourceAmount) {
      return AccountError.InsufficientBalance
    }
    src.balance -= options.sourceAmount
    return {
      commit: async () => {
        dst.balance += options.sourceAmount
      },
      rollback: async () => {
        src.balance += options.sourceAmount
      }
    }
  }

  async getAddress(accountId: string): Promise<string | null> {
    const account = this.accounts.get(accountId)
    if (!account) return null
    if (account.routing) {
      return account.routing.staticIlpAddress
    } else {
      return this.serverIlpAddress + '.' + accountId
    }
  }

  private find(
    predicate: (account: MockIlpAccount) => boolean
  ): IlpAccount | null {
    for (const [, account] of this.accounts) {
      if (predicate(account)) return account
    }
    return null
  }
}
