import { LedgerAccount } from './ledger-account/model'
import { LedgerTransferState } from './ledger-transfer/model'
import { ServiceDependencies } from './service'
import { getAccountTransfers } from './ledger-transfer'

interface AccountBalance {
  creditsPosted: bigint
  creditsPending: bigint
  debitsPosted: bigint
  debitsPending: bigint
}

export async function getAccountBalances(
  deps: ServiceDependencies,
  account: LedgerAccount
): Promise<AccountBalance> {
  const { credits, debits } = await getAccountTransfers(deps, account.id)

  let creditsPosted = 0n
  let creditsPending = 0n
  let debitsPosted = 0n
  let debitsPending = 0n

  for (const credit of credits) {
    if (credit.state === LedgerTransferState.POSTED) {
      creditsPosted += credit.amount
    } else if (credit.state === LedgerTransferState.PENDING) {
      creditsPending += credit.amount
    }
  }

  for (const debit of debits) {
    if (debit.state === LedgerTransferState.POSTED) {
      debitsPosted += debit.amount
    } else if (debit.state === LedgerTransferState.PENDING) {
      debitsPending += debit.amount
    }
  }

  return {
    creditsPosted,
    creditsPending,
    debitsPosted,
    debitsPending
  }
}
