import { TransactionOrKnex } from 'objection'

import { Account } from './model'
import { BaseService } from '../../shared/baseService'
import { AccountingService, AccountType } from '../../accounting/service'
import { AssetService, AssetOptions } from '../../asset/service'

export interface CreateOptions {
  asset: AssetOptions
}

export interface AccountService {
  create(options: CreateOptions): Promise<Account>
  get(id: string): Promise<Account | undefined>
}

interface ServiceDependencies extends BaseService {
  knex: TransactionOrKnex
  accountingService: AccountingService
  assetService: AssetService
}

export async function createAccountService({
  logger,
  knex,
  accountingService,
  assetService
}: ServiceDependencies): Promise<AccountService> {
  const log = logger.child({
    service: 'AccountService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    knex,
    accountingService,
    assetService
  }
  return {
    create: (options) => createAccount(deps, options),
    get: (id) => getAccount(deps, id)
  }
}

async function createAccount(
  deps: ServiceDependencies,
  options: CreateOptions
): Promise<Account> {
  const asset = await deps.assetService.getOrCreate(options.asset)
  return await Account.transaction(deps.knex, async (trx) => {
    const account = await Account.query(trx)
      .insertAndFetch({
        assetId: asset.id
      })
      .withGraphFetched('asset')

    // SPSP fallback account
    await deps.accountingService.createAccount({
      id: account.id,
      asset,
      type: AccountType.Credit
    })

    return account
  })
}

async function getAccount(
  deps: ServiceDependencies,
  id: string
): Promise<Account | undefined> {
  return await Account.query(deps.knex).findById(id).withGraphJoined('asset')
}
