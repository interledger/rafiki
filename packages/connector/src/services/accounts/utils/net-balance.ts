import { Account } from 'tigerbeetle-node'

export function getNetBalance(balance: Account): bigint {
  return (
    balance.credits_accepted - balance.debits_accepted - balance.debits_reserved
  )
}
