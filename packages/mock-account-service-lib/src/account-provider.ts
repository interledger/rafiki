interface Account {
  id: string
  name: string
  path: string
  walletAddressID: string
  walletAddress: string
  debitsPending: bigint
  debitsPosted: bigint
  creditsPending: bigint
  creditsPosted: bigint
  assetCode: string
  assetScale: number
  assetId: string
}

interface AccountsServer {
  clearAccounts(): Promise<void>
  setWalletAddress(
    id: string,
    walletID: string,
    walletAddress: string
  ): Promise<void>
  create(
    id: string,
    path: string,
    name: string,
    assetCode: string,
    assetScale: number,
    assetId: string
  ): Promise<void>
  listAll(): Promise<Account[]>
  get(id: string): Promise<Account | undefined>
  set(id: string, name: string): Promise<Account | undefined>
  getByWalletAddressId(walletAddressId: string): Promise<Account | undefined>
  getByPath(path: string): Promise<Account | undefined>
  getByWalletAddressUrl(walletAddressUrl: string): Promise<Account | undefined>
  voidPendingDebit(id: string, amount: bigint): Promise<void>
  voidPendingCredit(id: string, amount: bigint): Promise<void>
  pendingDebit(id: string, amount: bigint): Promise<void>
  pendingCredit(id: string, amount: bigint): Promise<void>
  debit(id: string, amount: bigint, clearPending: boolean): Promise<void>
  credit(id: string, amount: bigint, clearPending: boolean): Promise<void>
}

export class AccountProvider implements AccountsServer {
  accounts = new Map<string, Account>()

  async clearAccounts(): Promise<void> {
    this.accounts.clear()
  }

  async setWalletAddress(
    id: string,
    walletID: string,
    walletAddress: string
  ): Promise<void> {
    if (!this.accounts.has(id)) {
      throw new Error('account already exists')
    }

    const acc = this.accounts.get(id)

    if (!acc) {
      throw new Error('account not found')
    }

    acc.walletAddress = walletAddress
    acc.walletAddressID = walletID
  }

  async create(
    id: string,
    path: string,
    name: string,
    assetCode: string,
    assetScale: number,
    assetId: string
  ): Promise<void> {
    if (this.accounts.has(id)) {
      throw new Error('account already exists')
    }
    this.accounts.set(id, {
      id,
      name,
      path,
      walletAddress: '',
      walletAddressID: '',
      creditsPending: BigInt(0),
      creditsPosted: BigInt(0),
      debitsPending: BigInt(0),
      debitsPosted: BigInt(0),
      assetCode,
      assetScale,
      assetId
    })
  }

  async listAll(): Promise<Account[]> {
    return [...this.accounts.values()]
  }

  async get(id: string): Promise<Account | undefined> {
    return this.accounts.get(id)
  }

  async set(id: string, name: string): Promise<Account | undefined> {
    const account = this.accounts.get(id)
    if (!account) {
      throw new Error('account does not exists')
    }
    this.accounts.set(id, { ...account, name })
    return this.accounts.get(id)
  }

  async getByWalletAddressId(
    walletAddressId: string
  ): Promise<Account | undefined> {
    for (const acc of this.accounts.values()) {
      if (acc.walletAddressID == walletAddressId) {
        return acc
      }
    }
  }

  async getByWalletAddressUrl(
    walletAddressUrl: string
  ): Promise<Account | undefined> {
    return (await this.listAll()).find(
      (acc) => acc.walletAddress === walletAddressUrl
    )
  }

  async getByPath(path: string): Promise<Account | undefined> {
    return (await this.listAll()).find((acc) => acc.path === path)
  }

  async credit(
    id: string,
    amount: bigint,
    clearPending: boolean
  ): Promise<void> {
    if (!this.accounts.has(id)) {
      throw new Error('account does not exist')
    }
    if (amount < 0) {
      throw new Error('invalid credit amount')
    }

    const acc = this.accounts.get(id)

    if (!acc) {
      throw new Error('account not found')
    }

    if (clearPending && acc.creditsPending - amount < 0) {
      throw new Error('invalid amount, credits pending cannot be less than 0')
    }

    acc.creditsPosted += amount
    if (clearPending) {
      acc.creditsPending -= amount
    }
  }

  async debit(
    id: string,
    amount: bigint,
    clearPending: boolean
  ): Promise<void> {
    if (!this.accounts.has(id)) {
      throw new Error('account does not exist')
    }
    if (amount < 0) {
      throw new Error('invalid debit amount')
    }

    const acc = this.accounts.get(id)

    if (!acc) {
      throw new Error('account not found')
    }

    if (
      (clearPending && acc.debitsPending - amount < 0) ||
      acc.debitsPosted + amount < 0
    ) {
      throw new Error('invalid amount, debits pending cannot be less than 0')
    }

    if (
      !clearPending &&
      acc.creditsPosted < acc.debitsPosted + acc.debitsPending + amount
    ) {
      throw new Error('invalid debit, insufficient funds')
    }
    acc.debitsPosted += amount
    if (clearPending) {
      acc.debitsPending -= amount
    }
  }

  async pendingCredit(id: string, amount: bigint): Promise<void> {
    if (!this.accounts.has(id)) {
      throw new Error('account does not exist')
    }
    if (amount < 0) {
      throw new Error('invalid pending credit amount')
    }

    const acc = this.accounts.get(id)

    if (!acc) {
      throw new Error('account not found')
    }

    acc.creditsPending += amount
  }

  async pendingDebit(id: string, amount: bigint): Promise<void> {
    if (!this.accounts.has(id)) {
      throw new Error('account does not exist')
    }
    if (amount < 0) {
      throw new Error('invalid pending debit amount')
    }

    const acc = this.accounts.get(id)

    if (!acc) {
      throw new Error('account not found')
    }

    if (acc.creditsPosted < acc.debitsPosted + acc.debitsPending + amount) {
      throw new Error('invalid pending debit amount, insufficient funds')
    }

    acc.debitsPending += amount
  }

  async voidPendingDebit(id: string, amount: bigint): Promise<void> {
    if (!this.accounts.has(id)) {
      throw new Error('account does not exist')
    }
    if (amount < 0) {
      throw new Error('invalid void pending debit amount')
    }

    const acc = this.accounts.get(id)

    if (!acc) {
      throw new Error('account not found')
    }

    if (acc.debitsPending - amount < 0) {
      throw new Error('invalid amount, debits pending cannot be less than 0')
    }

    acc.debitsPending -= amount
  }

  async voidPendingCredit(id: string, amount: bigint): Promise<void> {
    if (!this.accounts.has(id)) {
      throw new Error('account does not exist')
    }
    if (amount < 0) {
      throw new Error('invalid void pending credit amount')
    }

    const acc = this.accounts.get(id)

    if (!acc) {
      throw new Error('account not found')
    }

    if (acc.debitsPending - amount < 0) {
      throw new Error('invalid amount, credits pending cannot be less than 0')
    }

    acc.creditsPending -= amount
  }
}
