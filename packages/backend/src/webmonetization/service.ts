import { BaseService } from '../shared/baseService'
import { InvoiceService } from '../open_payments/invoice/service'
import { Invoice } from '../open_payments/invoice/model'
import { WebMonetization } from './model'
import { ok } from 'assert'
import { ForeignKeyViolationError, TransactionOrKnex } from 'objection'

export interface WebMonetizationService {
  getInvoice(accountId: string): Promise<Invoice>
}

interface ServiceDependencies extends BaseService {
  invoiceService: InvoiceService
}

export async function createWebMonetizationService({
  logger,
  knex,
  invoiceService
}: ServiceDependencies): Promise<WebMonetizationService> {
  const log = logger.child({
    service: 'WebMonetizationService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    knex,
    invoiceService
  }
  return {
    getInvoice: (id) => getInvoice(deps, id)
  }
}

async function getInvoice(
  deps: ServiceDependencies,
  accountId: string
): Promise<Invoice> {
  const wm = await WebMonetization.query(deps.knex)
    .insertAndFetch({
      id: accountId
    })
    .withGraphFetched('invoice.account.asset')
    .onConflict('id')
    .ignore()
    .catch((err) => {
      if (err instanceof ForeignKeyViolationError) {
        throw new Error('account not found')
      }
      throw err
    })

  const createInvoice = async (
    knex: TransactionOrKnex,
    accountId: string
  ): Promise<Invoice> => {
    return WebMonetization.transaction(knex, async (trx) => {
      const description = 'Webmonetization earnings'
      const invoice = await deps.invoiceService.create(
        {
          accountId,
          description
        },
        trx
      )
      await WebMonetization.query(trx).patchAndFetchById(wm.id, {
        invoiceId: invoice.id
      })
      return invoice
    })
  }

  ok(deps.knex)
  // Create an invoice
  if (!wm.invoice) {
    return createInvoice(deps.knex, accountId)
  } else {
    return wm.invoice
  }
}
