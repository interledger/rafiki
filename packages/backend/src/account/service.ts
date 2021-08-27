import { Account } from './model'
import { BaseService } from '../shared/baseService'
import { strictEqual } from 'assert'
import { Transaction } from 'knex'
import { ConnectorService } from '../connector/service'

export interface AccountService {
  get(id: string): Promise<Account>
  create(scale: number, currency: string): Promise<Account>
  createSubAccount(superAccountId: string, trx?: Transaction): Promise<Account>
}

interface ServiceDependencies extends BaseService {
  connectorService: ConnectorService
}

export async function createAccountService({
  logger,
  knex,
  connectorService
}: ServiceDependencies): Promise<AccountService> {
  const log = logger.child({
    service: 'AccountService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    knex: knex,
    connectorService: connectorService
  }
  return {
    get: (id) => getAccount(deps, id),
    create: (scale, currency) => createAccount(deps, scale, currency),
    createSubAccount: (superAccountId, trx) =>
      createSubAccount(deps, superAccountId, trx)
  }
}

async function getAccount(
  deps: ServiceDependencies,
  id: string
): Promise<Account> {
  const ilpAccount = await deps.connectorService.getIlpAccount(id)
  if (ilpAccount.id != id) throw new Error('account not found')
  return Account.query(deps.knex).findById(ilpAccount.id)
}

async function createAccount(
  deps: ServiceDependencies,
  scale: number,
  currency: string
): Promise<Account> {
  const ilpAccountResponse = await deps.connectorService.createIlpAccount()
  if (!ilpAccountResponse.success || ilpAccountResponse.ilpAccount == null)
    throw new Error('account not created')

  return Account.query(deps.knex).insertAndFetch({
    id: ilpAccountResponse.ilpAccount.id,
    scale: scale,
    currency: currency
  })
}

async function createSubAccount(
  deps: ServiceDependencies,
  superAccountId: string,
  trx?: Transaction
): Promise<Account> {
  const ilpAccountResponse = await deps.connectorService.createIlpSubAccount(
    superAccountId
  )
  if (!ilpAccountResponse.success || ilpAccountResponse.ilpAccount == null)
    throw new Error('account not created')

  const parentAccount = await getAccount(deps, superAccountId)

  strictEqual(
    parentAccount.id,
    superAccountId,
    'parent account does not match what was requested'
  )

  strictEqual(
    ilpAccountResponse.ilpAccount.superAccountId,
    superAccountId,
    'parent ilpAccount does not match what was requested'
  )

  return Account.query(trx || deps.knex).insertAndFetch({
    id: ilpAccountResponse.ilpAccount.id,
    scale: parentAccount.scale,
    currency: parentAccount.currency,
    superAccountId: superAccountId
  })
}
