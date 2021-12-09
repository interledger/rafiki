import assert from 'assert'
import {
  AccountingService,
  IncomingAccount,
  OutgoingAccount
} from '../../rafiki'

import { Transaction } from '../../../../accounting/service'
import { TransferError } from '../../../../accounting/errors'

export enum MockAccountType {
  Account = 1,
  Invoice,
  Peer
}

interface MockAccount {
  id: string
  balance: bigint
  type?: MockAccountType
}

export type MockIncomingAccount = IncomingAccount &
  MockAccount & {
    http?: {
      incoming?: {
        authTokens: string[]
      }
    }
  }

export type MockOutgoingAccount = OutgoingAccount &
  MockAccount & {
    active?: boolean
    staticIlpAddress?: string
  }

type MockIlpAccount = MockIncomingAccount | MockOutgoingAccount

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
const isIncomingPeer = (o: any): o is MockIncomingAccount =>
  o.type === MockAccountType.Peer && o.http?.incoming

export class MockAccountingService implements AccountingService {
  private accounts: Map<string, MockIlpAccount> = new Map()

  async _getInvoice(invoiceId: string): Promise<OutgoingAccount | undefined> {
    const invoice = this.find(
      (account) =>
        account.type === MockAccountType.Invoice && account.id === invoiceId
    )
    return invoice as OutgoingAccount
  }

  async _getAccount(accountId: string): Promise<OutgoingAccount | undefined> {
    const account = this.find(
      (account) =>
        account.type === MockAccountType.Account && account.id === accountId
    )
    return account as OutgoingAccount
  }

  async _getByDestinationAddress(
    destinationAddress: string
  ): Promise<OutgoingAccount | undefined> {
    const account = this.find((account) => {
      if (account.type !== MockAccountType.Peer || !account.staticIlpAddress)
        return false
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

  async sendAndReceive(options: {
    sourceAccount: MockIncomingAccount
    destinationAccount: MockOutgoingAccount
    sourceAmount: bigint
    destinationAmount: bigint
    timeout: bigint
  }): Promise<Transaction | TransferError> {
    if (options.sourceAccount.balance < options.sourceAmount) {
      return TransferError.InsufficientBalance
    }
    let receiveLimit: MockIlpAccount | undefined
    if (options.destinationAccount.receivedAccountId) {
      receiveLimit = this.accounts.get(
        options.destinationAccount.receivedAccountId
      )
      assert.ok(receiveLimit)
      if (
        receiveLimit.balance <
        (options.destinationAmount || options.sourceAmount)
      ) {
        return TransferError.ReceiveLimitExceeded
      }
    }
    options.sourceAccount.balance -= options.sourceAmount
    return {
      commit: async () => {
        options.destinationAccount.balance +=
          options.destinationAmount ?? options.sourceAmount
        if (receiveLimit) {
          receiveLimit.balance -=
            options.destinationAmount ?? options.sourceAmount
        }
      },
      rollback: async () => {
        options.sourceAccount.balance += options.sourceAmount
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
