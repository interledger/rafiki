import { Invoice } from './model'
import { AccountService } from '../account/service'
import { isAccountError } from '../account/errors'
import { BaseService } from '../shared/baseService'
import { Pagination } from '../shared/pagination'
import assert from 'assert'
import { Transaction } from 'knex'

export interface InvoiceService {
  get(id: string): Promise<Invoice>
  create(
    accountId: string,
    description: string,
    expiresAt?: Date,
    trx?: Transaction
  ): Promise<Invoice>
  getAccountInvoicesPage(
    accountId: string,
    pagination?: Pagination
  ): Promise<Invoice[]>
}

interface ServiceDependencies extends BaseService {
  accountService: AccountService
}

export async function createInvoiceService({
  logger,
  knex,
  accountService
}: ServiceDependencies): Promise<InvoiceService> {
  const log = logger.child({
    service: 'InvoiceService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    knex,
    accountService
  }
  return {
    get: (id) => getInvoice(deps, id),
    create: (accountId, description, expiresAt, trx) =>
      createInvoice(deps, accountId, description, expiresAt, trx),
    getAccountInvoicesPage: (accountId, pagination) =>
      getAccountInvoicesPage(deps, accountId, pagination)
  }
}

async function getInvoice(
  deps: ServiceDependencies,
  id: string
): Promise<Invoice> {
  return Invoice.query(deps.knex).findById(id)
}

async function createInvoice(
  deps: ServiceDependencies,
  accountId: string,
  description: string,
  expiresAt?: Date,
  trx?: Transaction
): Promise<Invoice> {
  const invTrx = trx || (await Invoice.startTransaction(deps.knex))

  try {
    const account = await deps.accountService.get(accountId)
    if (!account) {
      throw new Error('unable to create invoice, account does not exist')
    }
    const invoiceAccount = await deps.accountService.create(
      { asset: account.asset },
      invTrx
    )
    if (isAccountError(invoiceAccount)) {
      throw new Error('unable to create invoice account, err=' + invoiceAccount)
    }

    const invoice = await Invoice.query(invTrx).insertAndFetch({
      accountId,
      invoiceAccountId: invoiceAccount.id,
      description,
      expiresAt: expiresAt,
      active: true
    })
    if (!trx) {
      await invTrx.commit()
    }
    return invoice
  } catch (err) {
    if (!trx) {
      await invTrx.rollback()
    }
    throw err
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
