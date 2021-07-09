import * as assert from 'assert'
import { v4 as uuid } from 'uuid'
import { ConnectorService } from '../connector/service'
import {
  IlpAccount,
  CreateIlpAccountMutationResponse,
  CreateIlpSubAccountMutationResponse,
  ExtendCreditInput,
  ExtendCreditMutationResponse,
  RevokeCreditInput,
  RevokeCreditMutationResponse,
  CreditError
} from '../connector/generated/graphql'

type FakeAccount = {
  id: string
  superAccountId?: string
  balance: bigint
}

export class MockConnectorService implements ConnectorService {
  public data: { [key: string]: FakeAccount } = {}

  async getIlpAccount(id: string): Promise<IlpAccount> {
    const account = this._get(id)
    return ({
      id: account.id,
      superAccountId: account.superAccountId,
      balance: { balance: account.balance }
    } as unknown) as IlpAccount
  }

  async createIlpAccount(): Promise<CreateIlpAccountMutationResponse> {
    const account = {
      id: uuid(),
      balance: BigInt(0)
    }
    this.data[account.id] = account
    return {
      success: true,
      code: '200',
      message: 'ok',
      ilpAccount: ({
        id: account.id,
        balance: { balance: account.balance }
      } as unknown) as IlpAccount
    }
  }

  async createIlpSubAccount(
    superAccountId: string
  ): Promise<CreateIlpSubAccountMutationResponse> {
    const account = {
      id: uuid(),
      superAccountId,
      balance: BigInt(0)
    }
    this.data[account.id] = account
    return {
      success: true,
      code: '200',
      message: 'ok',
      ilpAccount: ({
        id: account.id,
        superAccountId: account.superAccountId,
        balance: { balance: account.balance }
      } as unknown) as IlpAccount
    }
  }

  async extendCredit(
    input: ExtendCreditInput
  ): Promise<ExtendCreditMutationResponse> {
    const account = this._get(input.subAccountId)
    if (!account.superAccountId) {
      return {
        success: false,
        code: '400',
        error: CreditError.UnknownSubAccount,
        message: 'fail'
      }
    }
    assert.strictEqual(input.accountId, account.superAccountId)
    const parent = this._get(account.superAccountId)
    if (parent.balance < input.amount) {
      return {
        success: false,
        code: '400',
        error: CreditError.InsufficientBalance,
        message: 'fail'
      }
    }
    parent.balance -= input.amount
    account.balance += input.amount
    return { success: true, code: '200', message: 'ok' }
  }

  async revokeCredit(
    input: RevokeCreditInput
  ): Promise<RevokeCreditMutationResponse> {
    const account = this._get(input.subAccountId)
    if (!account.superAccountId) {
      return {
        success: false,
        code: '400',
        error: CreditError.UnknownSubAccount,
        message: 'fail'
      }
    }
    assert.strictEqual(input.accountId, account.superAccountId)
    const parent = this._get(account.superAccountId)
    if (account.balance < input.amount) {
      return {
        success: false,
        code: '400',
        error: CreditError.InsufficientBalance,
        message: 'fail'
      }
    }
    parent.balance += input.amount
    account.balance -= input.amount
    return { success: true, code: '200', message: 'ok' }
  }

  // For testing:

  async getAccountBalance(accountId: string): Promise<{ balance: bigint }> {
    return { balance: this._get(accountId).balance }
  }

  setAccountBalance(accountId: string, balance: bigint): void {
    this._get(accountId).balance = balance
  }

  modifyAccountBalance(accountId: string, diff: bigint): boolean {
    const account = this._get(accountId)
    const newBalance = account.balance + diff
    if (newBalance < 0) return false
    account.balance += diff
    return true
  }

  _get(accountId: string): FakeAccount {
    const account = this.data[accountId]
    if (!account) throw new Error('no account')
    return account
  }
}
