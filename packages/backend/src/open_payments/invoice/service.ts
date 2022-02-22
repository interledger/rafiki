import { Invoice, InvoiceEvent, InvoiceEventType } from './model'
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

export interface InvoiceService {
  get(id: string): Promise<Invoice | undefined>
  create(options: CreateOptions, trx?: Transaction): Promise<Invoice>
  getAccountInvoicesPage(
    accountId: string,
    pagination?: Pagination
  ): Promise<Invoice[]>
  processNext(): Promise<string | undefined>
}

interface ServiceDependencies extends BaseService {
  knex: TransactionOrKnex
  accountingService: AccountingService
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
        processAt: new Date(expiresAt.getTime())
      })
      .withGraphFetched('account.asset')

    // Invoice accounts are credited by the amounts received by the invoice.
    // Credits are restricted such that the invoice cannot receive more than that amount.
    await deps.accountingService.createLiquidityAccount(invoice)

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
      .where('processAt', '<=', now)
      .withGraphFetched('account.asset')

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
      // Add 30 seconds to allow a prepared (but not yet fulfilled/rejected) packet to finish before sending webhook event.
      processAt: new Date(Date.now() + 30_000)
    })
  } else {
    deps.logger.debug({ amountReceived }, 'deleting expired invoice')
    await invoice.$query(deps.knex).delete()
  }
}

// Create webhook event to withdraw deactivated invoices' liquidity.
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
        'deactivated invoice and empty balance'
      )
      await invoice.$query(deps.knex).patch({ processAt: null })
      return
    }

    const type =
      amountReceived < invoice.amount
        ? InvoiceEventType.InvoiceExpired
        : InvoiceEventType.InvoicePaid
    deps.logger.trace({ type }, 'creating invoice webhook event')

    await InvoiceEvent.query(deps.knex).insertAndFetch({
      type,
      data: invoice.toData(amountReceived),
      withdrawal: {
        accountId: invoice.id,
        assetId: invoice.account.assetId,
        amount: amountReceived
      }
    })

    await invoice.$query(deps.knex).patch({
      processAt: null
    })
  } catch (error) {
    deps.logger.warn({ error }, 'webhook event creation failed; retrying')
  }
}

async function getAccountInvoicesPage(
  deps: ServiceDependencies,
  accountId: string,
  pagination?: Pagination
): Promise<Invoice[]> {
  assert.ok(deps.knex, 'Knex undefined')

  return await Invoice.query(deps.knex).getPage(pagination).where({
    accountId: accountId
  })
}
