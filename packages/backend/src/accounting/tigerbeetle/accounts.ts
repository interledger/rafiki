import {
  Account,
  AccountFlags,
  CreateAccountError as CreateAccountErrorCode
} from 'tigerbeetle-node'

import { ServiceDependencies, TigerBeetleAccountCode } from './service'
import { TigerbeetleCreateAccountError } from './errors'
import { AccountId, toTigerBeetleId, AccountUserData128 } from './utils'

export interface CreateAccountOptions {
  id: AccountId
  ledger: number
  code: TigerBeetleAccountCode
  // This flag links the result of this account creation to the result of the next one in the request,
  // such that they will either succeed or fail together.
  // The last account in a chain of linked accounts does not have this flag set.
  linked?: boolean
  // When set, the account will retain the history of balances at each transfer.
  history?: boolean
  assetId: AccountUserData128
}

export async function createAccounts(
  deps: ServiceDependencies,
  accounts: CreateAccountOptions[]
): Promise<void> {
  const errors = await deps.tigerBeetle.createAccounts(
    accounts.map((account) => ({
      id: toTigerBeetleId(account.id),
      user_data_32: 0,
      user_data_64: 0n,
      user_data_128: toTigerBeetleId(account.assetId),
      reserved: 0,
      ledger: account.ledger,
      code: account.code,
      // Credit and debit accounts can both send and receive
      // but are restricted by their respective TigerBeetle flags.
      // In Rafiki transfers:
      // - the source account's debits increase
      // - the destination account's credits increase
      flags: flagsBasedOnAccountOptions(account),
      debits_pending: 0n,
      debits_posted: 0n,
      credits_pending: 0n,
      credits_posted: 0n,
      timestamp: 0n
    }))
  )
  for (const { result } of errors) {
    if (result !== CreateAccountErrorCode.ok)
      throw new TigerbeetleCreateAccountError(result)
  }
}

export function flagsBasedOnAccountOptions(
  options: CreateAccountOptions
): AccountFlags {
  // The TigerBeetle [flags] is a bitfield that toggles additional behavior.
  // It is a 16-bit unsigned integer.
  let returnVal =
    options.code === TigerBeetleAccountCode.SETTLEMENT
      ? AccountFlags.credits_must_not_exceed_debits
      : AccountFlags.debits_must_not_exceed_credits
  if (options.linked) returnVal |= AccountFlags.linked
  if (options.history) returnVal |= AccountFlags.history
  return returnVal
}

export async function getAccounts(
  deps: ServiceDependencies,
  accountIds: AccountId[]
): Promise<Account[]> {
  return await deps.tigerBeetle.lookupAccounts(
    accountIds.map((id) => toTigerBeetleId(id))
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
