import { AccountInfo } from '../../types'
import { Observable, Subject } from 'rxjs'
import { AccountNotFoundError } from '../../errors'
import { Errors } from 'ilp-packet'
import { AccountsService, AccountSnapshot, Transaction } from '.'
import debug from 'debug'
import { map } from 'rxjs/operators'
const { InsufficientLiquidityError } = Errors

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

  // Adjust amount the we owe
  // As this is called after we have got the fulfillment. It doesn't actually make much sense
  public async adjustBalancePayable(
    amount: bigint,
    accountId: string,
    callback: (trx: Transaction) => Promise<any>
  ): Promise<AccountSnapshot> {
    const account = await this.get(accountId)

    if (amount > BigInt(0)) {
      // Need to ensure these are actually called
      const transaction: Transaction = {
        commit: async () => {
          account.balancePayableInflight -= amount
          account.balancePayable += amount
        },
        rollback: async () => {
          account.balancePayableInflight -= amount
        }
      }

      try {
        // Maybe doing the adjustment must occur before the liquidity check + how to handle atomicity
        account.balancePayableInflight += amount
        if (
          account.balancePayableInflight + account.balancePayable >
          account.maximumPayable
        ) {
          throw new InsufficientLiquidityError(
            `Max payable exceeded: expected: ${(
              account.balancePayableInflight + account.balancePayable
            ).toString()} maximum: ${account.maximumPayable.toString()}`
          )
        }

        await callback(transaction)

        // TODO look at netting

        this._updatedAccounts.next(account)

        return {
          balanceReceivable: account.balanceReceivable,
          balancePayable: account.balancePayable
        } as AccountSnapshot
      } catch (error) {
        // Should this rethrow the the error?
        account.balancePayableInflight -= amount
        throw error(error)
      }
    } else {
      const transaction: Transaction = {
        commit: async () => {
          account.balancePayable += amount
        },
        rollback: async () => {}
      }

      await callback(transaction)

      return {
        balanceReceivable: account.balanceReceivable,
        balancePayable: account.balancePayable
      } as AccountSnapshot
    }
  }

  public async adjustBalanceReceivable(
    amount: bigint,
    accountId: string,
    callback: (trx: Transaction) => Promise<any>
  ): Promise<AccountSnapshot> {
    const account = await this.get(accountId)
    const transaction: Transaction = {
      commit: async () => {
        account.balanceReceivableInflight -= amount
        account.balanceReceivable += amount
      },
      rollback: async () => {
        account.balanceReceivableInflight -= amount
      }
    }

    // Try commit or catch and rollback
    try {
      // Maybe doing the adjustment must occur before the liquidity check + how to handle atomicity
      account.balanceReceivableInflight += amount
      if (
        account.balanceReceivableInflight + account.balanceReceivable >
        account.maximumReceivable
      ) {
        throw new InsufficientLiquidityError('')
      }

      await callback(transaction)

      // TODO Need to check if commit/rollback was called else throw

      return {
        balanceReceivable: account.balanceReceivable,
        balancePayable: account.balancePayable
      } as AccountSnapshot
    } catch (error) {
      // Should this rethrow the the error?
      account.balanceReceivableInflight -= amount
      throw error(error)
    }
  }

  // Can take money from payable and transfer to receivables
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async maybeSettle(account: InMemoryAccount): Promise<void> {
    // // First potentially net.
    // // if payable_balance > 0 && receivable_balance > 0 {
    // //   let amount_to_net = min(payable_balance, receivable_balance);
    // //   payable_balance = payable_balance - amount_to_net;
    // //   receivable_balance = receivable_balance - amount_to_net;
    // // }
    //
    // // Then try settle
    // // if (!settlement || !settlementEngine) {
    // //   logger.debug('Not deciding whether to settle for accountId=' + peer.id + '. No settlement engine configured.')
    // //   return
    // // }
    //
  }
}
