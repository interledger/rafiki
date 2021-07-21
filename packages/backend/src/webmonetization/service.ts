import { BaseService } from '../shared/baseService'
import { InvoiceService } from '../invoice/service'
import { Invoice } from '../invoice/model'
import { WebMonetization } from './model'
import { ok } from 'assert'
import { DateTime } from 'luxon'
import { AccountService } from '../account/service'

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
    .findById(account.id)
    .then((wm) => {
      if (!wm) {
        return WebMonetization.query(deps.knex).insertAndFetch({
          accountId: account.id
        })
      }
      return wm
    })

  ok(deps.knex)
  const expectedExpiryAt = DateTime.utc().endOf('day') //Expire Every Day
  // Create an invoice
  if (!wm.currentInvoiceId) {
    return WebMonetization.transaction(deps.knex, async (trx) => {
      const description = 'Webmonetization earnings'
      const invoice = await deps.invoiceService.create(
        account.id,
        description,
        expectedExpiryAt.toJSDate()
      )
      await WebMonetization.query(trx).patchAndFetchById(wm.accountId, {
        currentInvoiceId: invoice.id
      })
      return invoice
    })
  } else {
    const invoice = await deps.invoiceService.get(wm.currentInvoiceId)
    const currentInvoiceExpiry = DateTime.fromJSDate(invoice.expiresAt, {
      zone: 'utc'
    })

    // Check if currentInvoice has expired, if so create new invoice
    if (expectedExpiryAt.diff(currentInvoiceExpiry).toMillis() !== 0) {
      return WebMonetization.transaction(deps.knex, async (trx) => {
        const description = 'Webmonetization earnings'
        const invoice = await deps.invoiceService.create(
          account.id,
          description,
          expectedExpiryAt.toJSDate()
        )
        await WebMonetization.query(trx).patchAndFetchById(wm.accountId, {
          currentInvoiceId: invoice.id
        })
        return invoice
      })
    }

    return invoice
  }
}
