import {
  AccountsService,
  CreateOptions,
  IlpAccount,
  IlpBalance,
  Transfer
} from '../../services'

type MockIlpAccount = CreateOptions & {
  disabled: boolean
  balance: bigint
}

export class MockAccountsService implements AccountsService {
  private accounts: Map<string, MockIlpAccount> = new Map()

  constructor(private serverIlpAddress: string) {}

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
      (account) => !!account.http?.incoming?.authTokens.includes(token)
    )
  }

  async getAccountBalance(accountId: string): Promise<IlpBalance> {
    const account = this.accounts.get(accountId)
    if (!account) throw new Error('account not found')
    return {
      id: accountId,
      balance: account.balance
    }
  }

  async createAccount(account: MockIlpAccount): Promise<IlpAccount> {
    this.accounts.set(account.accountId, account)
    return account
  }

  async transferFunds(options: Transfer): Promise<Transfer> {
    if (!options.sourceAmount) throw new Error('missing sourceAmount')
    if (!options.callback) throw new Error('missing callback')
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
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        dst.balance += options.sourceAmount!
      },
      rollback: async () => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        src.balance += options.sourceAmount!
      }
    })
    return options
  }

  async getAddress(accountId: string): Promise<string> {
    const account = this.accounts.get(accountId)
    if (!account) throw new Error('account not found')
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
