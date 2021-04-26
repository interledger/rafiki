import { AccountInfo } from '../../types'
import { Observable } from 'rxjs'

export interface AccountSnapshot extends Readonly<AccountInfo> {
  readonly balancePayable: bigint;
  readonly balanceReceivable: bigint;
}

export interface Transaction {
  commit: () => Promise<any>;
  rollback: () => Promise<any>;
}

export interface AccountsService {
  readonly updated: Observable<AccountSnapshot>;

  /**
   * Get an account. Throws if the account cannot be loaded.
   */
  get: (accountId: string) => Promise<AccountSnapshot>;

  /**
   * Adjust the balance on a peer's payable account and return a snapshot of the account after the adjustment
   */
  adjustBalancePayable: (
    amount: bigint,
    accountId: string,
    callback: (trx: Transaction) => Promise<any>
  ) => Promise<AccountSnapshot>;

  /**
   * Adjust the balance on a peer's receivable account and return a snapshot of the account after the adjustment
   */
  adjustBalanceReceivable: (
    amount: bigint,
    accountId: string,
    callback: (trx: Transaction) => Promise<any>
  ) => Promise<AccountSnapshot>;
}

export * from './in-memory'
