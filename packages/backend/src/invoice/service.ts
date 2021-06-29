import { Invoice } from './model'
import { AccountService } from '../account/service'
import { BaseService } from '../shared/baseService'
import { UserService } from '../user/service'

export interface InvoiceService {
  get(id: string): Promise<Invoice>
  create(id?: string): Promise<Invoice>
  getUserInvoices(userId?: string): Promise<Invoice[]>
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
    getUserInvoices: (userId) => getUserInvoices(deps, userId)
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
  const user = await deps.userService.create()
  return Invoice.query(deps.knex).insertAndFetch({
    userId: user.id,
    accountId: user.accountId,
    active: false
  })
}

async function getUserInvoices(
  deps: ServiceDependencies,
  userId?: string
): Promise<Invoice[]> {
  deps.logger.info('Fetches all invoices for a userId')
  return Invoice.query(deps.knex).where({
    userId: userId
  })
}
