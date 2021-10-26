import { BaseService } from '../shared/baseService'
import { InvoiceService } from '../invoice/service'
import { Invoice } from '../invoice/model'
import { WebMonetization } from './model'
import { ok } from 'assert'
import { DateTime } from 'luxon'
import { AccountService } from '../account/service'
import { TransactionOrKnex } from 'objection'

export interface WebMonetizationService {
  getCurrentInvoice(accountId: string): Promise<Invoice>
}

interface ServiceDependencies extends BaseService {
  invoiceService: InvoiceService
  accountService: AccountService
}

export async function createWebMonetizationService({
  logger,
  knex,
  invoiceService,
  accountService
}: ServiceDependencies): Promise<WebMonetizationService> {
  const log = logger.child({
    service: 'WebMonetizationService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    knex,
    invoiceService,
    accountService
  }
  return {
    getCurrentInvoice: (id) => getCurrentInvoice(deps, id)
  }
}

async function getCurrentInvoice(
  deps: ServiceDependencies,
  accountId: string
): Promise<Invoice> {
  const account = await deps.accountService.get(accountId)
  if (!account) {
    throw new Error('account not found')
  }

  const wm = await WebMonetization.query(deps.knex)
    .insertAndFetch({
      id: account.id
    })
    .onConflict('id')
    .ignore()

  const createInvoice = async (
    knex: TransactionOrKnex,
    accountId: string,
    expiry: DateTime
  ): Promise<Invoice> => {
    return WebMonetization.transaction(knex, async (trx) => {
      const description = 'Webmonetization earnings'
      const invoice = await deps.invoiceService.create(
        accountId,
        description,
        expiry.toJSDate(),
        trx
      )
      await WebMonetization.query(trx).patchAndFetchById(wm.id, {
        currentInvoiceId: invoice.id
      })
      return invoice
    })
  }

  ok(deps.knex)
  const expectedExpiryAt = DateTime.utc().endOf('day') //Expire Every Day
  // Create an invoice
  if (!wm.currentInvoiceId) {
    return createInvoice(deps.knex, account.id, expectedExpiryAt)
  } else {
    const invoice = await deps.invoiceService.get(wm.currentInvoiceId)
    if (!invoice) throw new Error('invoice not found') // probably unreachable
    if (invoice.expiresAt) {
      const currentInvoiceExpiry = DateTime.fromJSDate(invoice.expiresAt, {
        zone: 'utc'
      })

      // Check if currentInvoice has expired, if so create new invoice
      if (expectedExpiryAt.diff(currentInvoiceExpiry).toMillis() !== 0) {
        return createInvoice(deps.knex, account.id, expectedExpiryAt)
      }
    }

    return invoice
  }
}
