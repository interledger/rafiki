import { Account } from 'tigerbeetle-node'

export function getNetBalance(balance: Account): bigint {
  return (
    balance.credit_accepted - balance.debit_accepted - balance.debit_reserved
  )
}
