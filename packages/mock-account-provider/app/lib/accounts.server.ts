import assert from 'assert'

export interface Account {
  id: string
  name: string
  paymentPointerID: string
  paymentPointer: string
  debitsPending: bigint
  debitsPosted: bigint
  creditsPending: bigint
  creditsPosted: bigint
}

export interface AccountsServer {
  clearAccounts(): Promise<void>
  setPaymentPointer(
    id: string,
    pointerID: string,
    paymentPointer: string
  ): Promise<void>
  create(id: string, name: string): Promise<void>
  listAll(): Promise<Account[]>
  get(id: string): Promise<Account | undefined>
  getByPaymentPointer(paymentPointer: string): Promise<Account | undefined>
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

  async setPaymentPointer(
    id: string,
    pointerID: string,
    paymentPointer: string
  ): Promise<void> {
    if (!this.accounts.has(id)) {
      throw new Error('account already exists')
    }

    const acc = this.accounts.get(id)
    assert.ok(acc)

    acc.paymentPointer = paymentPointer
    acc.paymentPointerID = pointerID
  }

  async create(id: string, name: string): Promise<void> {
    if (!this.accounts.has(id)) {
      throw new Error('account already exists')
    }
    this.accounts.set(id, {
      id,
      name,
      paymentPointer: '',
      paymentPointerID: '',
      creditsPending: BigInt(0),
      creditsPosted: BigInt(0),
      debitsPending: BigInt(0),
      debitsPosted: BigInt(0)
    })
  }

  async listAll(): Promise<Account[]> {
    return [...this.accounts.values()]
  }

  async get(id: string): Promise<Account | undefined> {
    return this.accounts.get(id)
  }

  async getByPaymentPointer(
    paymentPointer: string
  ): Promise<Account | undefined> {
    for (const acc of this.accounts.values()) {
      if (acc.paymentPointer == paymentPointer) {
        return acc
      }
    }
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
    assert.ok(acc)

    if (acc.creditsPending - amount < 0 || acc.creditsPosted + amount < 0) {
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
    assert.ok(acc)

    if (
      (clearPending && acc.debitsPending - amount < 0) ||
      acc.debitsPosted + amount < 0
    ) {
      throw new Error('invalid amount, debits pending cannot be less than 0')
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
    assert.ok(acc)
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
    assert.ok(acc)
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
    assert.ok(acc)

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
    assert.ok(acc)

    if (acc.debitsPending - amount < 0) {
      throw new Error('invalid amount, credits pending cannot be less than 0')
    }

    acc.creditsPending -= amount
  }
}

declare global {
  let __mockAccounts: AccountsServer | undefined
}

if (!global.__mockAccounts) {
  global.__mockAccounts = new AccountProvider()
}
const mockAccounts = global.__mockAccounts

export { mockAccounts }
