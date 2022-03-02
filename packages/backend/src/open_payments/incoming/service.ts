import {
  IncomingPayment,
  IncomingPaymentEvent,
  IncomingPaymentEventType
} from './model'
import { AccountingService } from '../../accounting/service'
import { Pagination } from '../../shared/baseModel'
import { BaseService } from '../../shared/baseService'
import assert from 'assert'
import { Transaction } from 'knex'
import { ForeignKeyViolationError, TransactionOrKnex } from 'objection'

export const POSITIVE_SLIPPAGE = BigInt(1)
// First retry waits 10 seconds
// Second retry waits 20 (more) seconds
// Third retry waits 30 (more) seconds, etc. up to 60 seconds
export const RETRY_BACKOFF_MS = 10_000

interface CreateOptions {
  accountId: string
  description?: string
  expiresAt: Date
  amount: bigint
}

export interface IncomingPaymentService {
  get(id: string): Promise<IncomingPayment | undefined>
  create(options: CreateOptions, trx?: Transaction): Promise<IncomingPayment>
  getAccountIncomingPaymentsPage(
    accountId: string,
    pagination?: Pagination
  ): Promise<IncomingPayment[]>
  processNext(): Promise<string | undefined>
}

interface ServiceDependencies extends BaseService {
  knex: TransactionOrKnex
  accountingService: AccountingService
}

export async function createIncomingPaymentService(
  deps_: ServiceDependencies
): Promise<IncomingPaymentService> {
  const log = deps_.logger.child({
    service: 'IncomingPaymentService'
  })
  const deps: ServiceDependencies = {
    ...deps_,
    logger: log
  }
  return {
    get: (id) => getIncomingPayment(deps, id),
    create: (options, trx) => createIncomingPayment(deps, options, trx),
    getAccountIncomingPaymentsPage: (accountId, pagination) =>
      getAccountIncomingPaymentsPage(deps, accountId, pagination),
    processNext: () => processNextIncomingPayment(deps)
  }
}

async function getIncomingPayment(
  deps: ServiceDependencies,
  id: string
): Promise<IncomingPayment | undefined> {
  return IncomingPayment.query(deps.knex)
    .findById(id)
    .withGraphJoined('account.asset')
}

async function createIncomingPayment(
  deps: ServiceDependencies,
  { accountId, description, expiresAt, amount }: CreateOptions,
  trx?: Transaction
): Promise<IncomingPayment> {
  const invTrx = trx || (await IncomingPayment.startTransaction(deps.knex))

  try {
    const incomingPayment = await IncomingPayment.query(invTrx)
      .insertAndFetch({
        accountId,
        description,
        expiresAt,
        amount,
        active: true,
        processAt: new Date(expiresAt.getTime())
      })
      .withGraphFetched('account.asset')

    // Incoming payment accounts are credited by the amounts received by the incoming payment.
    // Credits are restricted such that the incoming payments cannot receive more than that amount.
    await deps.accountingService.createLiquidityAccount(incomingPayment)

    if (!trx) {
      await invTrx.commit()
    }
    return incomingPayment
  } catch (err) {
    if (!trx) {
      await invTrx.rollback()
    }
    if (err instanceof ForeignKeyViolationError) {
      throw new Error(
        'unable to create incoming payment, account does not exist'
      )
    }
    throw err
  }
}

// Fetch (and lock) an incoming payment for work.
// Returns the id of the processed incoming payment (if any).
async function processNextIncomingPayment(
  deps_: ServiceDependencies
): Promise<string | undefined> {
  return deps_.knex.transaction(async (trx) => {
    const now = new Date(Date.now()).toISOString()
    const incomingPayments = await IncomingPayment.query(trx)
      .limit(1)
      // Ensure the incoming payments cannot be processed concurrently by multiple workers.
      .forUpdate()
      // If an incoming payment is locked, don't wait — just come back for it later.
      .skipLocked()
      .where('processAt', '<=', now)
      .withGraphFetched('account.asset')

    const incomingPayment = incomingPayments[0]
    if (!incomingPayment) return

    const deps = {
      ...deps_,
      knex: trx,
      logger: deps_.logger.child({
        incomingPayment: incomingPayment.id
      })
    }
    if (!incomingPayment.active) {
      await handleDeactivated(deps, incomingPayment)
    } else {
      await handleExpired(deps, incomingPayment)
    }
    return incomingPayment.id
  })
}

// Deactivate expired incoming payments that have some money.
// Delete expired incoming payments that have never received money.
async function handleExpired(
  deps: ServiceDependencies,
  incomingPayment: IncomingPayment
): Promise<void> {
  const amountReceived = await deps.accountingService.getTotalReceived(
    incomingPayment.id
  )
  if (amountReceived) {
    deps.logger.trace(
      { amountReceived },
      'deactivating expired incoming payment'
    )
    await incomingPayment.$query(deps.knex).patch({
      active: false,
      // Add 30 seconds to allow a prepared (but not yet fulfilled/rejected) packet to finish before sending webhook event.
      processAt: new Date(Date.now() + 30_000)
    })
  } else {
    deps.logger.debug({ amountReceived }, 'deleting expired incoming payment')
    await incomingPayment.$query(deps.knex).delete()
  }
}

// Create webhook event to withdraw deactivated incoming payments' liquidity.
async function handleDeactivated(
  deps: ServiceDependencies,
  incomingPayment: IncomingPayment
): Promise<void> {
  assert.ok(incomingPayment.processAt)
  try {
    const amountReceived = await deps.accountingService.getTotalReceived(
      incomingPayment.id
    )
    if (!amountReceived) {
      deps.logger.warn(
        { amountReceived },
        'deactivated incoming payment and empty balance'
      )
      await incomingPayment.$query(deps.knex).patch({ processAt: null })
      return
    }

    const type =
      amountReceived < incomingPayment.amount
        ? IncomingPaymentEventType.IncomingPaymentExpired
        : IncomingPaymentEventType.IncomingPaymentPaid
    deps.logger.trace({ type }, 'creating incoming payment webhook event')

    await IncomingPaymentEvent.query(deps.knex).insertAndFetch({
      type,
      data: incomingPayment.toData(amountReceived),
      withdrawal: {
        accountId: incomingPayment.id,
        assetId: incomingPayment.account.assetId,
        amount: amountReceived
      }
    })

    await incomingPayment.$query(deps.knex).patch({
      processAt: null
    })
  } catch (error) {
    deps.logger.warn({ error }, 'webhook event creation failed; retrying')
  }
}

async function getAccountIncomingPaymentsPage(
  deps: ServiceDependencies,
  accountId: string,
  pagination?: Pagination
): Promise<IncomingPayment[]> {
  assert.ok(deps.knex, 'Knex undefined')

  return await IncomingPayment.query(deps.knex).getPage(pagination).where({
    accountId: accountId
  })
}
