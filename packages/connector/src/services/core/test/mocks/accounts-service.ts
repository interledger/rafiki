import {
  AccountsService,
  CreateAccountError,
  CreateOptions,
  IlpAccount,
  IlpBalance,
  Transaction,
  Transfer,
  TransferError
} from '../../services'

type MockIlpAccount = CreateOptions & {
  disabled: boolean
  balance: bigint
}

export class MockAccountsService implements AccountsService {
  private accounts: Map<string, MockIlpAccount> = new Map()

  constructor(private serverIlpAddress: string) {}

  getAccount(accountId: string): Promise<IlpAccount | undefined> {
    const account = this.accounts.get(accountId)
    return Promise.resolve(account)
  }

  async getAccountByDestinationAddress(
    destinationAddress: string
  ): Promise<IlpAccount | undefined> {
    const account = this.find((account) => {
      const { routing } = account
      if (!routing) return false
      return destinationAddress.startsWith(routing.staticIlpAddress)
      //routing.staticIlpAddress === destinationAddress ||
      //routing.prefixes.some((prefix) => destinationAddress.startsWith(prefix))
    })
    return account
  }

  async getAccountByToken(token: string): Promise<IlpAccount | undefined> {
    return this.find(
      (account) => !!account.http?.incoming?.authTokens.includes(token)
    )
  }

  async getAccountBalance(accountId: string): Promise<IlpBalance | undefined> {
    const account = this.accounts.get(accountId)
    if (account) {
      return {
        id: accountId,
        balance: account.balance
      }
    }
  }

  async createAccount(
    account: MockIlpAccount
  ): Promise<IlpAccount | CreateAccountError> {
    this.accounts.set(account.accountId, account)
    return account
  }

  async transferFunds(options: Transfer): Promise<Transaction | TransferError> {
    const src = this.accounts.get(options.sourceAccountId)
    if (!src) return TransferError.UnknownSourceAccount
    const dst = this.accounts.get(options.destinationAccountId)
    if (!dst) return TransferError.UnknownDestinationAccount
    if (src.asset.code !== dst.asset.code)
      throw new Error('asset code mismatch')
    if (src.asset.scale !== dst.asset.scale)
      throw new Error('asset scale mismatch')
    if (src.balance < options.sourceAmount) {
      return TransferError.InsufficientBalance
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
  ): IlpAccount | undefined {
    for (const [, account] of this.accounts) {
      if (predicate(account)) return account
    }
  }
}
