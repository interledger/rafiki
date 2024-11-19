import { LedgerAccount } from './ledger-account/model'
import { ServiceDependencies } from './service'
import { TransactionOrKnex } from 'objection'

export interface AccountBalance {
  creditsPosted: bigint
  creditsPending: bigint
  debitsPosted: bigint
  debitsPending: bigint
}

export async function getAccountBalances(
  deps: ServiceDependencies,
  account: LedgerAccount,
  trx?: TransactionOrKnex
): Promise<AccountBalance> {
  const stopTimer = deps.telemetry.startTimer('psql_get_account_balances', {
    callName: 'AccountingService:Postgres:getAccountBalances'
  })
  try {
    const queryResult = await (trx ?? deps.knex).raw(
      `
    SELECT
      COALESCE(SUM("amount") FILTER(WHERE "creditAccountId" = :accountId AND "state" = 'POSTED'), 0) AS "creditsPosted",
      COALESCE(SUM("amount") FILTER(WHERE "creditAccountId" = :accountId AND "state" = 'PENDING'), 0) AS "creditsPending",
      COALESCE(SUM("amount") FILTER(WHERE "debitAccountId" = :accountId AND "state" = 'POSTED'), 0) AS "debitsPosted",
      COALESCE(SUM("amount") FILTER(WHERE "debitAccountId" = :accountId AND "state" = 'PENDING'), 0) AS "debitsPending"
    FROM "ledgerTransfers"
    WHERE ("creditAccountId" = :accountId OR "debitAccountId" = :accountId)
      AND ("state" = 'POSTED' OR ("state" = 'PENDING' AND "expiresAt" > NOW()));
    `,
      { accountId: account.id }
    )

    if (queryResult?.rows < 1) {
      throw new Error('No results when fetching balance for account')
    }

    const creditsPosted = BigInt(queryResult.rows[0].creditsPosted)
    const creditsPending = BigInt(queryResult.rows[0].creditsPending)
    const debitsPosted = BigInt(queryResult.rows[0].debitsPosted)
    const debitsPending = BigInt(queryResult.rows[0].debitsPending)

    return {
      creditsPosted,
      creditsPending,
      debitsPosted,
      debitsPending
    }
  } catch (err) {
    deps.logger.error(
      {
        err,
        accountId: account.id
      },
      'Could not fetch balances for account'
    )

    throw err
  } finally {
    stopTimer()
  }
}
