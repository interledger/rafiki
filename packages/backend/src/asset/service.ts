import assert from 'assert'
import { Transaction } from 'knex'
import { NotFoundError, UniqueViolationError } from 'objection'

import { AssetError, isAssetError } from './errors'
import { Asset } from './model'
import { BaseService } from '../shared/baseService'
import { AccountingService } from '../accounting/service'
import { Pagination } from '../shared/pagination'

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
    get: (asset, trx) => getAsset(deps, asset, trx),
    getOrCreate: (asset) => getOrCreateAsset(deps, asset),
    getById: (id, trx) => getAssetById(deps, id, trx),
    getPage: (pagination?) => getAssetsPage(deps, pagination)
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

/** TODO: Base64 encode/decode the cursors
 * Buffer.from("Hello World").toString('base64')
 * Buffer.from("SGVsbG8gV29ybGQ=", 'base64').toString('ascii')
 */

/** getAssetsPage
 * The pagination algorithm is based on the Relay connection specification.
 * Please read the spec before changing things:
 * https://relay.dev/graphql/connections.htm
 * @param pagination Pagination - cursors and limits.
 * @returns Asset[] An array of assets that form a page.
 */
async function getAssetsPage(
  deps: ServiceDependencies,
  pagination?: Pagination
): Promise<Asset[]> {
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
    const assets = await Asset.query(deps.knex)
      .whereRaw(
        '("createdAt", "id") > (select "createdAt" :: TIMESTAMP, "id" from "assets" where "id" = ?)',
        [pagination.after]
      )
      .orderBy([
        { column: 'createdAt', order: 'asc' },
        { column: 'id', order: 'asc' }
      ])
      .limit(first)
    return assets
  }

  /**
   * Backward pagination
   */
  if (typeof pagination?.before === 'string') {
    const assets = await Asset.query(deps.knex)
      .whereRaw(
        '("createdAt", "id") < (select "createdAt" :: TIMESTAMP, "id" from "assets" where "id" = ?)',
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
    return assets
  }

  const assets = await Asset.query(deps.knex)
    .orderBy([
      { column: 'createdAt', order: 'asc' },
      { column: 'id', order: 'asc' }
    ])
    .limit(first)
  return assets
}
