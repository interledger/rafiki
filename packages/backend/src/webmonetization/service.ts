import { BaseService } from '../shared/baseService'
import { InvoiceService } from '../open_payments/invoice/service'
import { Invoice } from '../open_payments/invoice/model'
import { WebMonetization } from './model'
import { ok } from 'assert'
import { PaymentPointerService } from '../payment_pointer/service'
import { TransactionOrKnex } from 'objection'

export interface WebMonetizationService {
  getInvoice(paymentPointerId: string): Promise<Invoice>
}

interface ServiceDependencies extends BaseService {
  invoiceService: InvoiceService
  paymentPointerService: PaymentPointerService
}

export async function createWebMonetizationService({
  logger,
  knex,
  invoiceService,
  paymentPointerService
}: ServiceDependencies): Promise<WebMonetizationService> {
  const log = logger.child({
    service: 'WebMonetizationService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    knex,
    invoiceService,
    paymentPointerService
  }
  return {
    getInvoice: (id) => getInvoice(deps, id)
  }
}

async function getInvoice(
  deps: ServiceDependencies,
  paymentPointerId: string
): Promise<Invoice> {
  const paymentPointer = await deps.paymentPointerService.get(paymentPointerId)
  if (!paymentPointer) {
    throw new Error('payment pointer not found')
  }

  const wm = await WebMonetization.query(deps.knex)
    .insertAndFetch({
      id: paymentPointerId
    })
    .withGraphFetched('invoice.paymentPointer.asset')
    .onConflict('id')
    .ignore()

  const createInvoice = async (
    knex: TransactionOrKnex,
    paymentPointerId: string
  ): Promise<Invoice> => {
    return WebMonetization.transaction(knex, async (trx) => {
      const description = 'Webmonetization earnings'
      const invoice = await deps.invoiceService.create(
        {
          paymentPointerId,
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
    return createInvoice(deps.knex, paymentPointerId)
  } else {
    return wm.invoice
  }
}
