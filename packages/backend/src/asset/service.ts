import { NotFoundError, UniqueViolationError } from 'objection'

import { AssetError } from './errors'
import { Asset } from './model'
import { Pagination } from '../shared/baseModel'
import { BaseService } from '../shared/baseService'
import { AccountingService, AccountTypeCode } from '../accounting/service'

export interface AssetOptions {
  code: string
  scale: number
}

export interface CreateOptions extends AssetOptions {
  withdrawalThreshold?: bigint
}

export interface UpdateOptions {
  id: string
  withdrawalThreshold: bigint | null
}

export interface AssetService {
  create(options: CreateOptions): Promise<Asset | AssetError>
  update(options: UpdateOptions): Promise<Asset | AssetError>
  get(id: string): Promise<void | Asset>
  getPage(pagination?: Pagination): Promise<Asset[]>
}

interface ServiceDependencies extends BaseService {
  accountingService: AccountingService
}

export async function createAssetService({
  logger,
  knex,
  accountingService
}: ServiceDependencies): Promise<AssetService> {
  const log = logger.child({
    service: 'AssetService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    knex,
    accountingService
  }
  return {
    create: (options) => createAsset(deps, options),
    update: (options) => updateAsset(deps, options),
    get: (id) => getAsset(deps, id),
    getPage: (pagination?) => getAssetsPage(deps, pagination)
  }
}

async function createAsset(
  deps: ServiceDependencies,
  { code, scale, withdrawalThreshold }: CreateOptions
): Promise<Asset | AssetError> {
  try {
    // Asset rows include a smallserial 'ledger' column that would have sequence gaps
    // if a transaction is rolled back.
    // https://www.postgresql.org/docs/current/datatype-numeric.html#DATATYPE-SERIAL
    //
    // However, we need to know the 'ledger' column value from the inserted asset row
    // before we can create the liquidity and settlement tigerbeetle balances.
    return await Asset.transaction(async (trx) => {
      const asset = await Asset.query(trx).insertAndFetch({
        code,
        scale,
        withdrawalThreshold
      })
      await deps.accountingService.createLiquidityAccount(
        asset,
        AccountTypeCode.LiquidityAsset
      )
      await deps.accountingService.createSettlementAccount(asset.ledger)

      return asset
    })
  } catch (err) {
    if (err instanceof UniqueViolationError) {
      return AssetError.DuplicateAsset
    }
    throw err
  }
}

async function updateAsset(
  deps: ServiceDependencies,
  { id, withdrawalThreshold }: UpdateOptions
): Promise<Asset | AssetError> {
  if (!deps.knex) {
    throw new Error('Knex undefined')
  }
  try {
    return await Asset.query(deps.knex)
      .patchAndFetchById(id, { withdrawalThreshold })
      .throwIfNotFound()
  } catch (err) {
    if (err instanceof NotFoundError) {
      return AssetError.UnknownAsset
    }
    throw err
  }
}

async function getAsset(
  deps: ServiceDependencies,
  id: string
): Promise<void | Asset> {
  return await Asset.query(deps.knex).findById(id)
}

async function getAssetsPage(
  deps: ServiceDependencies,
  pagination?: Pagination
): Promise<Asset[]> {
  return await Asset.query(deps.knex).getPage(pagination)
}
