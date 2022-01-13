import { Invoice } from './model'
import { AccountingService } from '../../accounting/service'
import { BaseService } from '../../shared/baseService'
import { Pagination } from '../../shared/pagination'
import { EventType, WebhookService } from '../../webhook/service'
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

export interface InvoiceService {
  get(id: string): Promise<Invoice | undefined>
  create(options: CreateOptions, trx?: Transaction): Promise<Invoice>
  getAccountInvoicesPage(
    accountId: string,
    pagination?: Pagination
  ): Promise<Invoice[]>
  handlePayment(invoiceId: string): Promise<void>
  processNext(): Promise<string | undefined>
}

interface ServiceDependencies extends BaseService {
  knex: TransactionOrKnex
  accountingService: AccountingService
  webhookService: WebhookService
}

export async function createInvoiceService(
  deps_: ServiceDependencies
): Promise<InvoiceService> {
  const log = deps_.logger.child({
    service: 'InvoiceService'
  })
  const deps: ServiceDependencies = {
    ...deps_,
    logger: log
  }
  return {
    get: (id) => getInvoice(deps, id),
    create: (options, trx) => createInvoice(deps, options, trx),
    getAccountInvoicesPage: (accountId, pagination) =>
      getAccountInvoicesPage(deps, accountId, pagination),
    handlePayment: (invoiceId) => handleInvoicePayment(deps, invoiceId),
    processNext: () => processNextInvoice(deps)
  }
}

async function getInvoice(
  deps: ServiceDependencies,
  id: string
): Promise<Invoice | undefined> {
  return Invoice.query(deps.knex).findById(id).withGraphJoined('account.asset')
}

async function createInvoice(
  deps: ServiceDependencies,
  { accountId, description, expiresAt, amount }: CreateOptions,
  trx?: Transaction
): Promise<Invoice> {
  const invTrx = trx || (await Invoice.startTransaction(deps.knex))

  try {
    const invoice = await Invoice.query(invTrx)
      .insertAndFetch({
        accountId,
        description,
        expiresAt,
        amount,
        active: true,
        // Add 30 seconds to allow a prepared (but not yet fulfilled/rejected) packet to finish before being deactivated.
        processAt: new Date(expiresAt.getTime() + 30_000)
      })
      .withGraphFetched('account.asset')

    // Invoice accounts are credited by the amounts received by the invoice.
    // Credits are restricted such that the invoice cannot receive more than that amount.
    await deps.accountingService.createAccount({
      id: invoice.id,
      asset: invoice.account.asset
    })

    if (!trx) {
      await invTrx.commit()
    }
    return invoice
  } catch (err) {
    if (!trx) {
      await invTrx.rollback()
    }
    if (err instanceof ForeignKeyViolationError) {
      throw new Error('unable to create invoice, account does not exist')
    }
    throw err
  }
}

async function handleInvoicePayment(
  deps: ServiceDependencies,
  invoiceId: string
): Promise<void> {
  const amountReceived = await deps.accountingService.getTotalReceived(
    invoiceId
  )
  if (!amountReceived) {
    return
  }
  await Invoice.query(deps.knex)
    .patch({
      active: false,
      processAt: new Date()
    })
    .where('id', invoiceId)
    .andWhere('amount', '<=', amountReceived.toString())
}

// Fetch (and lock) an invoice for work.
// Returns the id of the processed invoice (if any).
async function processNextInvoice(
  deps_: ServiceDependencies
): Promise<string | undefined> {
  return deps_.knex.transaction(async (trx) => {
    const now = new Date(Date.now()).toISOString()
    const invoices = await Invoice.query(trx)
      .limit(1)
      // Ensure the invoices cannot be processed concurrently by multiple workers.
      .forUpdate()
      // If an invoice is locked, don't wait — just come back for it later.
      .skipLocked()
      .where('processAt', '<', now)

    const invoice = invoices[0]
    if (!invoice) return

    const deps = {
      ...deps_,
      knex: trx,
      logger: deps_.logger.child({
        invoice: invoice.id
      })
    }
    if (!invoice.active) {
      await handleDeactivated(deps, invoice)
    } else {
      await handleExpired(deps, invoice)
    }
    return invoice.id
  })
}

// Deactivate expired invoices that have some money.
// Delete expired invoices that have never received money.
async function handleExpired(
  deps: ServiceDependencies,
  invoice: Invoice
): Promise<void> {
  const amountReceived = await deps.accountingService.getTotalReceived(
    invoice.id
  )
  if (amountReceived) {
    deps.logger.trace({ amountReceived }, 'deactivating expired invoice')
    await invoice.$query(deps.knex).patch({
      active: false,
      processAt: new Date()
    })
  } else {
    deps.logger.debug({ amountReceived }, 'deleting expired invoice')
    await invoice.$query(deps.knex).delete()
  }
}

// Withdraw deactivated invoices' liquidity.
async function handleDeactivated(
  deps: ServiceDependencies,
  invoice: Invoice
): Promise<void> {
  assert.ok(invoice.processAt)
  try {
    const amountReceived = await deps.accountingService.getTotalReceived(
      invoice.id
    )
    if (!amountReceived) {
      deps.logger.warn(
        { amountReceived },
        'invoice with processAt and empty balance'
      )
      await invoice.$query(deps.knex).patch({ processAt: null })
      return
    }

    deps.logger.trace(
      { amountReceived },
      'withdrawing deactivated invoice balance'
    )
    const error = await deps.accountingService.createWithdrawal({
      id: invoice.id,
      accountId: invoice.id,
      amount: amountReceived,
      timeout: BigInt(deps.webhookService.timeout) * BigInt(1e9) // ms -> ns
    })
    if (error) throw error

    const { status } = await deps.webhookService.send({
      id: invoice.id,
      type:
        amountReceived < invoice.amount
          ? EventType.InvoiceExpired
          : EventType.InvoicePaid,
      invoice,
      amountReceived
    })
    if (status === 200 || status === 205) {
      const error = await deps.accountingService.commitWithdrawal(invoice.id)
      if (error) throw error
      if (status === 200) {
        await invoice.$query(deps.knex).patch({
          processAt: null
        })
      }
    }
  } catch (error) {
    const webhookAttempts = invoice.webhookAttempts + 1
    deps.logger.warn(
      { error, webhookAttempts },
      'webhook attempt failed; retrying'
    )
    await deps.accountingService.rollbackWithdrawal(invoice.id)

    const processAt = new Date(
      invoice.processAt.getTime() +
        Math.min(webhookAttempts, 6) * RETRY_BACKOFF_MS
    )
    await invoice.$query(deps.knex).patch({
      processAt,
      webhookAttempts
    })
  }
}

/** TODO: Base64 encode/decode the cursors
 * Buffer.from("Hello World").toString('base64')
 * Buffer.from("SGVsbG8gV29ybGQ=", 'base64').toString('ascii')
 */

/** getAccountInvoicesPage
 * The pagination algorithm is based on the Relay connection specification.
 * Please read the spec before changing things:
 * https://relay.dev/graphql/connections.htm
 * @param deps ServiceDependencies.
 * @param accountId The accountId of the invoices.
 * @param pagination Pagination - cursors and limits.
 * @returns Invoice[] An array of invoices that form a page.
 */
async function getAccountInvoicesPage(
  deps: ServiceDependencies,
  accountId: string,
  pagination?: Pagination
): Promise<Invoice[]> {
  assert.ok(deps.knex, 'Knex undefined')

  if (
    typeof pagination?.before === 'undefined' &&
    typeof pagination?.last === 'number'
  )
    throw new Error("Can't paginate backwards from the start.")

  const first = pagination?.first || 20
  if (first < 0 || first > 100) throw new Error('Pagination index error')
  const last = pagination?.last || 20
  if (last < 0 || last > 100) throw new Error('Pagination index error')

  /**
   * Forward pagination
   */
  if (typeof pagination?.after === 'string') {
    return Invoice.query(deps.knex)
      .where({
        accountId: accountId
      })
      .andWhereRaw(
        '("createdAt", "id") > (select "createdAt" :: TIMESTAMP, "id" from "invoices" where "id" = ?)',
        [pagination.after]
      )
      .orderBy([
        { column: 'createdAt', order: 'asc' },
        { column: 'id', order: 'asc' }
      ])
      .limit(first)
  }

  /**
   * Backward pagination
   */
  if (typeof pagination?.before === 'string') {
    return Invoice.query(deps.knex)
      .where({
        accountId: accountId
      })
      .andWhereRaw(
        '("createdAt", "id") < (select "createdAt" :: TIMESTAMP, "id" from "invoices" where "id" = ?)',
        [pagination.before]
      )
      .orderBy([
        { column: 'createdAt', order: 'desc' },
        { column: 'id', order: 'desc' }
      ])
      .limit(last)
      .then((resp) => {
        return resp.reverse()
      })
  }

  return Invoice.query(deps.knex)
    .where({
      accountId: accountId
    })
    .orderBy([
      { column: 'createdAt', order: 'asc' },
      { column: 'id', order: 'asc' }
    ])
    .limit(first)
}
