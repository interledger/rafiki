import { AccountsService, IlpAccount, AdjustmentOptions } from '../../services'

export class MockAccountsService implements AccountsService {
  private accounts: Map<string, IlpAccount> = new Map()

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
      return (
        routing.ilpAddress === destinationAddress ||
        routing.prefixes.some((prefix) => destinationAddress.startsWith(prefix))
      )
    })
    if (account) {
      return account
    } else {
      throw new Error('no account found')
    }
  }

  async getAccountByToken(token: string): Promise<IlpAccount | null> {
    return this.find(
      (account) => !!account.http?.incomingTokens.includes(token)
    )
  }

  async createAccount(account: IlpAccount): Promise<IlpAccount> {
    this.accounts.set(account.accountId, account)
    return account
  }

  async adjustBalances(options: AdjustmentOptions): Promise<void> {
    const src = await this.getAccount(options.sourceAccountId)
    const dst = await this.getAccount(options.destinationAccountId)
    if (src.balance.assetCode !== dst.balance.assetCode)
      throw new Error('asset code mismatch')
    if (src.balance.assetScale !== dst.balance.assetScale)
      throw new Error('asset scale mismatch')

    src.balance.current -= options.sourceAmount
    options.callback({
      commit: async () => {
        dst.balance.current += options.sourceAmount
      },
      rollback: async () => {
        src.balance.current += options.sourceAmount
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
