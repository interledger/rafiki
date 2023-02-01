import {
  Account,
  AccountFlags,
  CreateAccountError as CreateAccountErrorCode
} from 'tigerbeetle-node'

import { ServiceDependencies } from './service'
import { CreateAccountError } from './errors'
import { toTigerbeetleId } from './utils'
import { AccountId } from '../utils'

const ACCOUNT_RESERVED = Buffer.alloc(48)

// Credit and debit accounts can both send and receive
// but are restricted by their respective Tigerbeetle flags.
// In Rafiki transfers:
// - the source account's debits increase
// - the destination account's credits increase
export enum AccountType {
  Credit = 'Credit', // debits_must_not_exceed_credits
  Debit = 'Debit' // credits_must_not_exceed_debits
}

export interface CreateAccountOptions {
  id: AccountId
  type: AccountType
  ledger: number
  code: number
}

export async function createAccounts(
  deps: ServiceDependencies,
  accounts: CreateAccountOptions[]
): Promise<void> {
  const errors = await deps.tigerbeetle.createAccounts(
    accounts.map((account) => ({
      id: toTigerbeetleId(account.id),
      user_data: 0n,
      reserved: ACCOUNT_RESERVED,
      ledger: account.ledger,
      code: account.code,
      flags:
        account.type === AccountType.Debit
          ? AccountFlags.credits_must_not_exceed_debits
          : AccountFlags.debits_must_not_exceed_credits,
      debits_pending: 0n,
      debits_posted: 0n,
      credits_pending: 0n,
      credits_posted: 0n,
      timestamp: 0n
    }))
  )
  for (const { code } of errors) {
    if (code !== CreateAccountErrorCode.linked_event_failed) {
      throw new CreateAccountError(code)
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
