import { AccountInfo } from '../../types'
import { Observable, Subject } from 'rxjs'
import { AccountNotFoundError } from '../../errors'
import { AccountsService, AccountSnapshot, Transaction } from '.'
import debug from 'debug'
import { map } from 'rxjs/operators'

// Implementations SHOULD use a better logger than debug for production services
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const log = debug('rafiki:in-memory-accounts-service')

/**
 * An in-memory account service for development and testing purposes.
 */
interface InMemoryAccount extends AccountSnapshot {
  balancePayableInflight: bigint
  balancePayable: bigint
  balanceReceivable: bigint
  balanceReceivableInflight: bigint
}

export class InMemoryAccountsService implements AccountsService {
  private _updatedAccounts: Subject<AccountSnapshot>
  private _accounts: Map<string, InMemoryAccount>

  constructor() {
    this._accounts = new Map<string, InMemoryAccount>()
    this._updatedAccounts = new Subject<AccountSnapshot>()
  }

  get updated(): Observable<AccountSnapshot> {
    return this._updatedAccounts
      .asObservable()
      .pipe(map((value) => Object.assign({}, value)))
  }

  async get(id: string): Promise<InMemoryAccount> {
    const account = this._accounts.get(id)
    if (!account) {
      throw new AccountNotFoundError(id)
    }
    return account
  }

  add(accountInfo: AccountInfo): void {
    const account: InMemoryAccount = {
      ...accountInfo,
      balancePayableInflight: BigInt(0),
      balancePayable: BigInt(0),
      balanceReceivable: BigInt(0),
      balanceReceivableInflight: BigInt(0)
    }
    this._accounts.set(account.id, account)
  }

  update(accountInfo: AccountInfo): void {
    const account = this.get(accountInfo.id)
    Object.assign(account, accountInfo)
  }

  remove(id: string): void {
    this._accounts.delete(id)
  }

  public async adjustBalances(
    amount: bigint,
    incomingAccountId: string,
    outgoingAccountId: string,
    callback: (trx: Transaction) => Promise<unknown>
  ): Promise<void> {
    const incomingAccount = await this.get(incomingAccountId)
    const outgoingAccount = await this.get(outgoingAccountId)

    if (amount > BigInt(0)) {
      // Need to ensure these are actually called
      const transaction: Transaction = {
        commit: async () => {
          incomingAccount.balanceReceivableInflight -= amount
          incomingAccount.balanceReceivable += amount
          outgoingAccount.balancePayableInflight -= amount
          outgoingAccount.balancePayable += amount
        },
        rollback: async () => {
          incomingAccount.balanceReceivableInflight -= amount
          outgoingAccount.balancePayableInflight -= amount
        }
      }

      try {
        incomingAccount.balanceReceivableInflight += amount
        outgoingAccount.balancePayableInflight += amount

        await callback(transaction)

        // TODO look at netting

        this._updatedAccounts.next(incomingAccount)
        this._updatedAccounts.next(outgoingAccount)
      } catch (error) {
        // Should this rethrow the the error?
        incomingAccount.balanceReceivableInflight -= amount
        outgoingAccount.balancePayableInflight -= amount
        throw error(error)
      }
    } else {
      const transaction: Transaction = {
        commit: async () => {
          incomingAccount.balanceReceivableInflight -= amount
          outgoingAccount.balancePayableInflight -= amount
        },
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        rollback: async () => {}
      }

      await callback(transaction)
    }
  }
}
