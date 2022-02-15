import assert from 'assert'
import { Transaction } from 'knex'
import { NotFoundError, UniqueViolationError } from 'objection'

import { AssetError, isAssetError } from './errors'
import { Asset } from './model'
import { BaseService } from '../shared/baseService'
import { AccountingService } from '../accounting/service'

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
  get(asset: AssetOptions, trx?: Transaction): Promise<void | Asset>
  getOrCreate(asset: AssetOptions): Promise<Asset>
  getById(id: string, trx?: Transaction): Promise<void | Asset>
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
    get: (asset, trx) => getAsset(deps, asset, trx),
    getOrCreate: (asset) => getOrCreateAsset(deps, asset),
    getById: (id, trx) => getAssetById(deps, id, trx)
  }
}

async function createAsset(
  deps: ServiceDependencies,
  { code, scale, withdrawalThreshold }: CreateOptions
): Promise<Asset | AssetError> {
  try {
    // Asset rows include a smallserial 'unit' column that would have sequence gaps
    // if a transaction is rolled back.
    // https://www.postgresql.org/docs/current/datatype-numeric.html#DATATYPE-SERIAL
    //
    // However, we need to know the 'unit' column value from the inserted asset row
    // before we can create the liquidity and settlement tigerbeetle balances.
    return await Asset.transaction(async (trx) => {
      const asset = await Asset.query(trx).insertAndFetch({
        code,
        scale,
        withdrawalThreshold
      })
      await deps.accountingService.createLiquidityAccount(asset)
      await deps.accountingService.createSettlementAccount(asset.unit)

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
  assert.ok(deps.knex, 'Knex undefined')
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
  { code, scale }: AssetOptions,
  trx?: Transaction
): Promise<void | Asset> {
  return await Asset.query(trx || deps.knex).findOne({ code, scale })
}

async function getOrCreateAsset(
  deps: ServiceDependencies,
  options: AssetOptions
): Promise<Asset> {
  const asset = await Asset.query(deps.knex).findOne(options)
  if (asset) {
    return asset
  } else {
    const asset = await createAsset(deps, options)
    assert.ok(!isAssetError(asset))
    return asset
  }
}

async function getAssetById(
  deps: ServiceDependencies,
  id: string,
  trx?: Transaction
): Promise<void | Asset> {
  return await Asset.query(trx || deps.knex).findById(id)
}
