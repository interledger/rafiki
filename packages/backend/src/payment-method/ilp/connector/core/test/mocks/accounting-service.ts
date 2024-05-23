import { IncomingAccount, OutgoingAccount } from '../../rafiki'

import {
  Transaction,
  AccountingService,
  Deposit,
  Withdrawal
} from '../../../../../../accounting/service'
import {
  CreateAccountError,
  TransferError
} from '../../../../../../accounting/errors'
import { CreateAccountError as CreateAccountErrorCode } from 'tigerbeetle-node'
import { TransactionOrKnex } from 'objection'

interface MockAccount {
  id: string
  balance: bigint
}

export type MockIncomingAccount = IncomingAccount &
  MockAccount & {
    http?: {
      incoming?: {
        authTokens: string[]
      }
    }
    state?: never
  }

export type MockOutgoingAccount = OutgoingAccount &
  MockAccount & {
    state?: string
    staticIlpAddress?: string
  }

type MockIlpAccount = MockIncomingAccount | MockOutgoingAccount

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
const isIncomingPeer = (o: any): o is MockIncomingAccount => o.http?.incoming

export class MockAccountingService implements AccountingService {
  private accounts: Map<string, MockIlpAccount> = new Map()

  async _getIncomingPayment(
    incomingPaymentId: string
  ): Promise<OutgoingAccount | undefined> {
    const incomingPayment = this.find(
      (account) =>
        account.id === incomingPaymentId && account.state !== undefined
    )
    return incomingPayment as OutgoingAccount
  }

  async _getAccount(accountId: string): Promise<OutgoingAccount | undefined> {
    const account = this.find(
      (account) => account.id === accountId && account.state === undefined
    )
    return account as OutgoingAccount
  }

  async _getByDestinationAddress(
    destinationAddress: string
  ): Promise<OutgoingAccount | undefined> {
    const account = this.find((account) => {
      if (!account.staticIlpAddress) return false
      return destinationAddress.startsWith(account.staticIlpAddress)
    })
    return account as OutgoingAccount
  }

  async _getByIncomingToken(
    token: string
  ): Promise<IncomingAccount | undefined> {
    return this.find(
      (account) =>
        isIncomingPeer(account) &&
        !!account.http?.incoming?.authTokens.includes(token)
    )
  }

  async getBalance(accountId: string): Promise<bigint | undefined> {
    const account = this.accounts.get(accountId)
    if (account) {
      return account.balance
    }
  }

  async create(account: MockIlpAccount): Promise<MockIlpAccount> {
    if (!account.id) throw new Error('unexpected asset account')
    this.accounts.set(account.id, account)
    return account
  }

  async createTransfer({
    sourceAccount,
    destinationAccount,
    sourceAmount,
    destinationAmount
  }: {
    sourceAccount: MockIncomingAccount
    destinationAccount: MockOutgoingAccount
    sourceAmount: bigint
    destinationAmount: bigint
    timeout: number
  }): Promise<Transaction | TransferError> {
    if (sourceAccount.balance < sourceAmount) {
      return TransferError.InsufficientBalance
    }
    sourceAccount.balance -= sourceAmount
    return {
      post: async () => {
        destinationAccount.balance += destinationAmount
      },
      void: async () => {
        sourceAccount.balance += sourceAmount
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

  async createLiquidityAccount(
    account: MockIlpAccount
  ): Promise<MockIlpAccount> {
    // Conflict
    if (account.id === '409') {
      throw new CreateAccountError(CreateAccountErrorCode.exists)
    }
    return account
  }

  createDeposit(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    deposit: Deposit,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    trx?: TransactionOrKnex
  ): Promise<void | TransferError> {
    return Promise.resolve(undefined)
  }

  createSettlementAccount(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ledger: number,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    trx?: TransactionOrKnex
  ): Promise<void> {
    return Promise.resolve(undefined)
  }

  createWithdrawal(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    withdrawal: Withdrawal
  ): Promise<void | TransferError> {
    return Promise.resolve(undefined)
  }

  getAccountsTotalReceived(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ids: string[]
  ): Promise<(bigint | undefined)[]> {
    return Promise.resolve([])
  }

  getAccountsTotalSent(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ids: string[]
  ): Promise<(bigint | undefined)[]> {
    return Promise.resolve([])
  }

  getSettlementBalance(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ledger: number
  ): Promise<bigint | undefined> {
    return Promise.resolve(undefined)
  }

  getTotalReceived(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    id: string
  ): Promise<bigint | undefined> {
    return Promise.resolve(undefined)
  }

  getTotalSent(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    id: string
  ): Promise<bigint | undefined> {
    return Promise.resolve(undefined)
  }

  postWithdrawal(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    id: string
  ): Promise<void | TransferError> {
    return Promise.resolve(undefined)
  }

  voidWithdrawal(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    id: string
  ): Promise<void | TransferError> {
    return Promise.resolve(undefined)
  }
}
