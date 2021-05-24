import {
  AccountsService,
  IlpAccount,
  AdjustmentOptions,
  IlpBalance
} from '../../services'

type MockIlpAccount = IlpAccount & { balance: bigint }

export class MockAccountsService implements AccountsService {
  private accounts: Map<string, MockIlpAccount> = new Map()

  getAccount(accountId: string): Promise<IlpAccount> {
    const account = this.accounts.get(accountId)
    return account
      ? Promise.resolve(account)
      : Promise.reject(new Error('no account found'))
  }

  async getAccountByDestinationAddress(
    destinationAddress: string
  ): Promise<IlpAccount> {
    const account = this.find((account) => {
      const { routing } = account
      if (!routing) return false
      return destinationAddress.startsWith(routing.staticIlpAddress)
      //routing.staticIlpAddress === destinationAddress ||
      //routing.prefixes.some((prefix) => destinationAddress.startsWith(prefix))
    })
    if (account) {
      return account
    } else {
      throw new Error('no account found')
    }
  }

  async getAccountByToken(token: string): Promise<IlpAccount | null> {
    return this.find(
      (account) => !!account.http?.incoming.authTokens.includes(token)
    )
  }

  async getAccountBalance(accountId: string): Promise<IlpBalance> {
    const account = this.accounts.get(accountId)
    if (!account) throw new Error('account not found')
    return {
      balance: account.balance
    }
  }

  async createAccount(account: MockIlpAccount): Promise<IlpAccount> {
    this.accounts.set(account.accountId, account)
    return account
  }

  async adjustBalances(options: AdjustmentOptions): Promise<void> {
    const src = this.accounts.get(options.sourceAccountId)
    const dst = this.accounts.get(options.destinationAccountId)
    if (!src) throw new Error('src not found')
    if (!dst) throw new Error('dst not found')
    if (src.asset.code !== dst.asset.code)
      throw new Error('asset code mismatch')
    if (src.asset.scale !== dst.asset.scale)
      throw new Error('asset scale mismatch')

    src.balance -= options.sourceAmount
    options.callback({
      commit: async () => {
        dst.balance += options.sourceAmount
      },
      rollback: async () => {
        src.balance += options.sourceAmount
      }
    })
  }

  private find(predicate: (account: IlpAccount) => boolean): IlpAccount | null {
    for (const [, account] of this.accounts) {
      if (predicate(account)) return account
    }
    return null
  }
}
