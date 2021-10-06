import {
  Account,
  AccountFlags,
  Client,
  CreateAccountError
} from 'tigerbeetle-node'
import { BalanceError, CreateBalanceError, CreateBalancesError } from './errors'
import { BaseService } from '../shared/baseService'
import { uuidToBigInt } from '../shared/utils'

const ACCOUNT_RESERVED = Buffer.alloc(48)

export interface BalanceOptions {
  id: string
  debitBalance?: boolean
  unit: number
}

export type Balance = Required<BalanceOptions> & {
  balance: bigint
}

export interface BalanceService {
  create(balances: BalanceOptions[]): Promise<void | CreateBalancesError>
  get(ids: string[]): Promise<Balance[]>
}

interface ServiceDependencies extends BaseService {
  tigerbeetle: Client
}

export async function createBalanceService({
  logger,
  tigerbeetle
}: ServiceDependencies): Promise<BalanceService> {
  const log = logger.child({
    service: 'BalanceService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    tigerbeetle
  }
  return {
    create: (balances) => createBalances(deps, balances),
    get: (ids) => getBalances(deps, ids)
  }
}

async function createBalances(
  deps: ServiceDependencies,
  balances: BalanceOptions[]
): Promise<void | CreateBalancesError> {
  const res = await deps.tigerbeetle.createAccounts(
    balances.map(({ id, debitBalance, unit }, idx) => {
      let flags = 0
      if (debitBalance) {
        flags |= AccountFlags.credits_must_not_exceed_debits
      } else {
        flags |= AccountFlags.debits_must_not_exceed_credits
      }
      if (idx < balances.length - 1) {
        flags |= AccountFlags.linked
      }
      return {
        id: uuidToBigInt(id),
        user_data: BigInt(0),
        reserved: ACCOUNT_RESERVED,
        unit,
        code: 0,
        flags,
        debits_accepted: BigInt(0),
        debits_reserved: BigInt(0),
        credits_accepted: BigInt(0),
        credits_reserved: BigInt(0),
        timestamp: 0n
      }
    })
  )
  for (const { index, code } of res) {
    switch (code) {
      case CreateAccountError.linked_event_failed:
        break
      case CreateAccountError.exists:
      case CreateAccountError.exists_with_different_user_data:
      case CreateAccountError.exists_with_different_reserved_field:
      case CreateAccountError.exists_with_different_unit:
      case CreateAccountError.exists_with_different_code:
      case CreateAccountError.exists_with_different_flags:
        return { index, error: BalanceError.DuplicateBalance }
      default:
        throw new CreateBalanceError(code)
    }
  }
}

async function getBalances(
  deps: ServiceDependencies,
  ids: string[]
): Promise<Balance[]> {
  const balances = await deps.tigerbeetle.lookupAccounts(
    ids.map((id) => uuidToBigInt(id))
  )
  return balances.map((balance, idx) => ({
    id: ids[idx],
    unit: balance.unit,
    debitBalance: !!(
      balance.flags & AccountFlags.credits_must_not_exceed_debits
    ),
    balance: calculateBalance(deps, balance)
  }))
}

function calculateBalance(deps: ServiceDependencies, balance: Account): bigint {
  if (balance.flags & AccountFlags.credits_must_not_exceed_debits) {
    return (
      balance.debits_accepted -
      balance.credits_accepted +
      balance.debits_reserved
    )
  } else {
    if (!(balance.flags & AccountFlags.debits_must_not_exceed_credits)) {
      deps.logger.warn({ balance }, 'balance missing credit/debit flag')
    }
    return (
      balance.credits_accepted -
      balance.debits_accepted -
      balance.debits_reserved
    )
  }
}
