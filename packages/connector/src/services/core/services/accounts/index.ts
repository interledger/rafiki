import { AccountInfo } from '../../types'

export interface AccountSnapshot extends Readonly<AccountInfo> {
  readonly balancePayable: bigint
  readonly balanceReceivable: bigint
}

export interface Transaction {
  commit: () => Promise<void>
  rollback: () => Promise<void>
}

export interface AccountsService {
  /**
   * Get an account. Throws if the account cannot be loaded.
   */
  get: (accountId: string) => Promise<AccountInfo>

  /**
   * Adjust the balances on accounts
   */
  adjustBalances: (
    amount: bigint,
    incomingAccountId: string,
    outgoingAccountId: string,
    callback: (trx: Transaction) => Promise<unknown>
  ) => Promise<void>
}

export * from './in-memory'
