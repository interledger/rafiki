import {
  Account,
  AccountFlags,
  CreateAccountError as CreateAccountErrorCode
} from 'tigerbeetle-node'

import { ServiceDependencies, TigerbeetleAccountCode } from './service'
import { TigerbeetleCreateAccountError } from './errors'
import { AccountId, toTigerbeetleId } from './utils'

export interface CreateAccountOptions {
  id: AccountId
  ledger: number
  code: TigerbeetleAccountCode
}

export async function createAccounts(
  deps: ServiceDependencies,
  accounts: CreateAccountOptions[]
): Promise<void> {
  const errors = await deps.tigerbeetle.createAccounts(
    accounts.map((account) => ({
      id: toTigerbeetleId(account.id),
      user_data_32: 0,
      user_data_64: 0n,
      user_data_128: 0n,
      reserved: 0,
      ledger: account.ledger,
      code: account.code,
      // Credit and debit accounts can both send and receive
      // but are restricted by their respective TigerBeetle flags.
      // In Rafiki transfers:
      // - the source account's debits increase
      // - the destination account's credits increase
      flags:
        account.code === TigerbeetleAccountCode.SETTLEMENT
          ? AccountFlags.credits_must_not_exceed_debits
          : AccountFlags.debits_must_not_exceed_credits,
      debits_pending: 0n,
      debits_posted: 0n,
      credits_pending: 0n,
      credits_posted: 0n,
      timestamp: 0n
    }))
  )
  for (const { result } of errors) {
    if (result !== CreateAccountErrorCode.linked_event_failed) {
      throw new TigerbeetleCreateAccountError(result)
    }
  }
}

export async function getAccounts(
  deps: ServiceDependencies,
  accountIds: AccountId[]
): Promise<Account[]> {
  return await deps.tigerbeetle.lookupAccounts(
    accountIds.map((id) => toTigerbeetleId(id))
  )
}

export function calculateBalance(account: Account): bigint {
  if (account.flags & AccountFlags.credits_must_not_exceed_debits) {
    return BigInt(
      account.debits_posted - account.credits_posted + account.debits_pending
    )
  } else {
    return BigInt(
      account.credits_posted - account.debits_posted - account.debits_pending
    )
  }
}
