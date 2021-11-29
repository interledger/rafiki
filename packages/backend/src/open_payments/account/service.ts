import { Account } from './model'
import { BaseService } from '../../shared/baseService'
import { AssetService, AssetOptions } from '../../asset/service'

export interface CreateOptions {
  asset: AssetOptions
}

export interface AccountService {
  create(options: CreateOptions): Promise<Account>
  get(id: string): Promise<Account | undefined>
}

interface ServiceDependencies extends BaseService {
  assetService: AssetService
}

export async function createAccountService({
  logger,
  knex,
  assetService
}: ServiceDependencies): Promise<AccountService> {
  const log = logger.child({
    service: 'AccountService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    knex,
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
  const { id: assetId } = await deps.assetService.getOrCreate(options.asset)
  return await Account.query(deps.knex)
    .insertAndFetch({
      assetId
    })
    .withGraphFetched('asset')
}

async function getAccount(
  deps: ServiceDependencies,
  id: string
): Promise<Account | undefined> {
  return await Account.query(deps.knex).findById(id).withGraphJoined('asset')
}
