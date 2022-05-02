import {
  AccountingService,
  IncomingAccount,
  OutgoingAccount
} from '../../rafiki'

import { Transaction } from '../../../../accounting/service'
import { TransferError } from '../../../../accounting/errors'
import { IncomingPaymentError } from '../../../../open_payments/payment/incoming/errors'

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
  ): Promise<OutgoingAccount | IncomingPaymentError> {
    const incomingPayment = this.find(
      (account) =>
        account.id === incomingPaymentId && account.state !== undefined
    )
    if (incomingPayment) return incomingPayment as OutgoingAccount
    else return IncomingPaymentError.UnknownPaymentAccount
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
    timeout: bigint
  }): Promise<Transaction | TransferError> {
    if (sourceAccount.balance < sourceAmount) {
      return TransferError.InsufficientBalance
    }
    sourceAccount.balance -= sourceAmount
    return {
      commit: async () => {
        destinationAccount.balance += destinationAmount
      },
      rollback: async () => {
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
}
