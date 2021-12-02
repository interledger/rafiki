import {
  Account,
  AccountFlags,
  CreateAccountError as CreateAccountErrorCode
} from 'tigerbeetle-node'

import { AccountType, ServiceDependencies } from './service'
import { CreateAccountError } from './errors'
import { AccountIdOptions, getAccountId } from './utils'

const ACCOUNT_RESERVED = Buffer.alloc(48)

export type CreateAccountOptions = AccountIdOptions & {
  asset: {
    unit: number
  }
  type?: AccountType
}

export async function createAccounts(
  deps: ServiceDependencies,
  accounts: CreateAccountOptions[]
): Promise<void> {
  const errors = await deps.tigerbeetle.createAccounts(
    accounts.map((account) => ({
      id: getAccountId(account),
      user_data: BigInt(0),
      reserved: ACCOUNT_RESERVED,
      unit: account.asset.unit,
      code: 0,
      flags:
        account.type === AccountType.Debit
          ? AccountFlags.credits_must_not_exceed_debits
          : account.type === AccountType.Credit
          ? AccountFlags.debits_must_not_exceed_credits
          : 0,
      debits_accepted: BigInt(0),
      debits_reserved: BigInt(0),
      credits_accepted: BigInt(0),
      credits_reserved: BigInt(0),
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
  accounts: AccountIdOptions[]
): Promise<Account[]> {
  return await deps.tigerbeetle.lookupAccounts(
    accounts.map((account) => getAccountId(account))
  )
}

export function calculateBalance(account: Account): bigint {
  if (account.flags & AccountFlags.credits_must_not_exceed_debits) {
    return (
      account.debits_accepted -
      account.credits_accepted +
      account.debits_reserved
    )
  } else {
    return (
      account.credits_accepted -
      account.debits_accepted -
      account.debits_reserved
    )
  }
}
