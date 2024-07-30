import { IncomingAccount, OutgoingAccount } from '../../rafiki'

import {
  Transaction,
  AccountingService,
  Deposit,
  Withdrawal,
  GetLedgerTransfersResult
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
    throw new Error('Not implemented!')
  }

  async createLiquidityAndLinkedSettlementAccount(
    account: MockIlpAccount
  ): Promise<MockIlpAccount> {
    return await this.createLiquidityAccount(account)
  }

  createWithdrawal(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    withdrawal: Withdrawal
  ): Promise<void | TransferError> {
    throw new Error('Not implemented!')
  }

  getAccountsTotalReceived(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ids: string[]
  ): Promise<(bigint | undefined)[]> {
    throw new Error('Not implemented!')
  }

  getAccountsTotalSent(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ids: string[]
  ): Promise<(bigint | undefined)[]> {
    throw new Error('Not implemented!')
  }

  getSettlementBalance(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ledger: number
  ): Promise<bigint | undefined> {
    throw new Error('Not implemented!')
  }

  getTotalReceived(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    id: string
  ): Promise<bigint | undefined> {
    throw new Error('Not implemented!')
  }

  getTotalSent(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    id: string
  ): Promise<bigint | undefined> {
    throw new Error('Not implemented!')
  }

  postWithdrawal(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    id: string
  ): Promise<void | TransferError> {
    throw new Error('Not implemented!')
  }

  voidWithdrawal(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    id: string
  ): Promise<void | TransferError> {
    throw new Error('Not implemented!')
  }

  getAccountTransfers(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    id: string
  ): Promise<GetLedgerTransfersResult> {
    throw new Error('Not implemented!')
  }
}
