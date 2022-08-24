import assert from 'assert'

export interface Account {
  id: string
  name: string
  debits_pending: bigint
  debits_posted: bigint
  credits_pending: bigint
  credits_posted: bigint
}

export interface AccountsServer {
  create(id: string, name: string): Promise<void | Error>
  listAll(): Promise<Account[]>
  get(id: string): Promise<Account | undefined>
  voidPendingDebit(id: string, amount: bigint): Promise<void | Error>
  voidPendingCredit(id: string, amount: bigint): Promise<void | Error>
  pendingDebit(id: string, amount: bigint): Promise<void | Error>
  pendingCredit(id: string, amount: bigint): Promise<void | Error>
  debit(
    id: string,
    amount: bigint,
    clearPending: boolean
  ): Promise<void | Error>

  credit(
    id: string,
    amount: bigint,
    clearPending: boolean
  ): Promise<void | Error>
}

export class AccountProvider implements AccountsServer {
  accounts = new Map<string, Account>()
  async create(id: string, name: string): Promise<void | Error> {
    if (!this.accounts.has(id)) {
      return new Error('account already exists')
    }
    this.accounts.set(id, {
      id,
      name,
      credits_pending: BigInt(0),
      credits_posted: BigInt(0),
      debits_pending: BigInt(0),
      debits_posted: BigInt(0)
    })
  }

  async listAll(): Promise<Account[]> {
    return [...this.accounts.values()]
  }

  async get(id: string): Promise<Account | undefined> {
    return this.accounts.get(id)
  }

  async credit(
    id: string,
    amount: bigint,
    clearPending: boolean
  ): Promise<void | Error> {
    if (!this.accounts.has(id)) {
      return new Error('account does not exist')
    }
    if (amount < 0) {
      return new Error('invalid credit amount')
    }

    const acc = this.accounts.get(id)
    assert.ok(acc)

    if (acc.credits_pending - amount < 0 || acc.credits_posted + amount < 0) {
      return new Error('invalid amount, credits pending cannot be less than 0')
    }

    acc.credits_posted += amount
    if (clearPending) {
      acc.credits_pending -= amount
    }
  }

  async debit(
    id: string,
    amount: bigint,
    clearPending: boolean
  ): Promise<void | Error> {
    if (!this.accounts.has(id)) {
      return new Error('account does not exist')
    }
    if (amount < 0) {
      return new Error('invalid debit amount')
    }

    const acc = this.accounts.get(id)
    assert.ok(acc)

    if (
      (clearPending && acc.debits_pending - amount < 0) ||
      acc.debits_posted + amount < 0
    ) {
      return new Error('invalid amount, debits pending cannot be less than 0')
    }

    acc.debits_posted += amount
    if (clearPending) {
      acc.debits_pending -= amount
    }
  }

  async pendingCredit(id: string, amount: bigint): Promise<void | Error> {
    if (!this.accounts.has(id)) {
      return new Error('account does not exist')
    }
    if (amount < 0) {
      return new Error('invalid pending credit amount')
    }

    const acc = this.accounts.get(id)
    assert.ok(acc)
    acc.credits_pending += amount
  }

  async pendingDebit(id: string, amount: bigint): Promise<void | Error> {
    if (!this.accounts.has(id)) {
      return new Error('account does not exist')
    }
    if (amount < 0) {
      return new Error('invalid pending debit amount')
    }

    const acc = this.accounts.get(id)
    assert.ok(acc)
    acc.debits_pending += amount
  }

  async voidPendingDebit(id: string, amount: bigint): Promise<void | Error> {
    if (!this.accounts.has(id)) {
      return new Error('account does not exist')
    }
    if (amount < 0) {
      return new Error('invalid void pending debit amount')
    }

    const acc = this.accounts.get(id)
    assert.ok(acc)

    if (acc.debits_pending - amount < 0) {
      return new Error('invalid amount, debits pending cannot be less than 0')
    }

    acc.debits_pending -= amount
  }

  async voidPendingCredit(id: string, amount: bigint): Promise<void | Error> {
    if (!this.accounts.has(id)) {
      return new Error('account does not exist')
    }
    if (amount < 0) {
      return new Error('invalid void pending credit amount')
    }

    const acc = this.accounts.get(id)
    assert.ok(acc)

    if (acc.debits_pending - amount < 0) {
      return new Error('invalid amount, credits pending cannot be less than 0')
    }

    acc.credits_pending -= amount
  }
}

declare global {
  let __mockAccounts: AccountProvider | undefined
}

if (!global.__mockAccounts) {
  global.__mockAccounts = new AccountProvider()
}
const mockAccounts = global.__mockAccounts

export { mockAccounts }
