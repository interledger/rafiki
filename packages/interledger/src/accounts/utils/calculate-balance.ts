import { Account } from 'tigerbeetle-node'

export function calculateCreditBalance(balance: Account): bigint {
  return (
    balance.credits_accepted - balance.debits_accepted - balance.debits_reserved
  )
}

export function calculateDebitBalance(balance: Account): bigint {
  return (
    balance.debits_accepted - balance.credits_accepted + balance.debits_reserved
  )
}
