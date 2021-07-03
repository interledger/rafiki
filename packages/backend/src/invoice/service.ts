import { Invoice } from './model'
import { AccountService } from '../account/service'
import { BaseService } from '../shared/baseService'
import { UserService } from '../user/service'
import assert from 'assert'

export interface InvoiceService {
  get(id: string): Promise<Invoice>
  create(id?: string): Promise<Invoice>
  getUserInvoicesPage(
    userId: string,
    pagination?: Pagination
  ): Promise<Invoice[]>
}

interface ServiceDependencies extends BaseService {
  accountService: AccountService
  userService: UserService
}

export async function createInvoiceService({
  logger,
  knex,
  accountService,
  userService
}: ServiceDependencies): Promise<InvoiceService> {
  const log = logger.child({
    service: 'InvoiceService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    knex,
    accountService,
    userService
  }
  return {
    get: (id) => getInvoice(deps, id),
    create: () => createInvoice(deps),
    getUserInvoicesPage: (userId, pagination) =>
      getUserInvoicesPage(deps, userId, pagination)
  }
}

async function getInvoice(
  deps: ServiceDependencies,
  id: string
): Promise<Invoice> {
  deps.logger.info('returns a user')
  return Invoice.query(deps.knex).findById(id)
}

async function createInvoice(deps: ServiceDependencies): Promise<Invoice> {
  deps.logger.info('Creates an invoice')
  // TODO: should get user from context
  const user = await deps.userService.create()
  const subAccount = await deps.accountService.createSubAccount(user.accountId)
  return Invoice.query(deps.knex).insertAndFetch({
    userId: user.id,
    accountId: subAccount.id,
    active: true
  })
}

interface Pagination {
  after?: string // Forward pagination: cursor.
  before?: string // Backward pagination: cursor.
  first?: number // Forward pagination: limit.
  last?: number // Backward pagination: limit.
}

/** getUserInvoicesPage
 * The pagination algorithm is based on the Relay connection specification.
 * Please read the spec before changing things:
 * https://relay.dev/graphql/connections.htm
 * @param deps ServiceDependencies.
 * @param userId The userId of the user.
 * @param pagination Pagination - cursors and limits.
 * @returns Invoice[] An array of invoices that form a page.
 */
async function getUserInvoicesPage(
  deps: ServiceDependencies,
  userId: string,
  pagination?: Pagination
): Promise<Invoice[]> {
  deps.logger.info('Fetches a single page of invoices for a userId')
  assert.ok(deps.knex, 'Knex undefined')

  const first = pagination?.first || 20
  if (first < 0 || first > 100) throw new Error('Pagination index error')
  const last = pagination?.last || 20
  if (last < 0 || last > 100) throw new Error('Pagination index error')
  /**
   * Forward pagination
   */
  if (typeof pagination?.after === 'string') {
    const { createdAt, id } = fromCursor(pagination.after)
    return Invoice.query(deps.knex)
      .where({
        userId: userId
      })
      .andWhere(deps.knex.raw('(createdAt, id) > (?, ?)', createdAt, id))
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
    const { createdAt, id } = fromCursor(pagination.before)
    return Invoice.query(deps.knex)
      .where({
        userId: userId
      })
      .andWhere(deps.knex.raw('(createdAt, id) < (?, ?)', createdAt, id))
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
      userId: userId
    })
    .orderBy([
      { column: 'createdAt', order: 'asc' },
      { column: 'id', order: 'asc' }
    ])
    .limit(first)
}

/**
 * Forms a cursor from the createdAt timestamp and the invoice id.
 * @param createdAt
 * @param id
 */
export function toCursor(createdAt: string, id: string): string {
  return Buffer.from(createdAt + '#' + id).toString('base64')
}

type DestructuredCursor = {
  createdAt: string
  id: string
}

function fromCursor(cursor: string): DestructuredCursor {
  const cursorString = Buffer.from(cursor, 'base64').toString('ascii')
  const cursorArray = cursorString.split('#')
  // TODO: validate createdAt and id
  return {
    createdAt: cursorArray[0],
    id: cursorArray[1]
  }
}
