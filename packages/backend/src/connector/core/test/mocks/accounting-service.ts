import assert from 'assert'
import {
  AccountingService,
  IncomingAccount,
  OutgoingAccount
} from '../../rafiki'

import { Transaction } from '../../../../accounting/service'
import { TransferError } from '../../../../accounting/errors'

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
  }

export type MockOutgoingAccount = OutgoingAccount &
  MockAccount & {
    active?: boolean
    staticIlpAddress?: string
  }

type MockIlpAccount = MockIncomingAccount | MockOutgoingAccount

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
const isIncomingPeer = (o: any): o is MockIncomingAccount => o.http?.incoming

export class MockAccountingService implements AccountingService {
  private accounts: Map<string, MockIlpAccount> = new Map()

  _get(accountId: string): Promise<MockIlpAccount | undefined> {
    const account = this.accounts.get(accountId)
    return Promise.resolve(account)
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
      receiveLimit = await this._get(
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
