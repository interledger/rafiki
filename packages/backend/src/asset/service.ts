import { NotFoundError, UniqueViolationError } from 'objection'

import { AssetError } from './errors'
import { Asset } from './model'
import { Pagination, SortOrder } from '../shared/baseModel'
import { BaseService } from '../shared/baseService'
import { AccountingService, LiquidityAccountType } from '../accounting/service'
import { WalletAddress } from '../open_payments/wallet_address/model'
import { Peer } from '../payment-method/ilp/peer/model'
import { CacheDataStore } from '../middleware/cache/data-stores'
import { TenantSettingService } from '../tenants/settings/service'
import { TenantSettingKeys } from '../tenants/settings/model'
import { IAppConfig } from '../config/app'

export interface AssetOptions {
  code: string
  scale: number
}

export interface CreateOptions extends AssetOptions {
  tenantId: string
  withdrawalThreshold?: bigint
  liquidityThreshold?: bigint
}

export interface UpdateOptions {
  id: string
  tenantId: string
  withdrawalThreshold: bigint | null
  liquidityThreshold: bigint | null
}

export interface DeleteOptions {
  id: string
  tenantId: string
  deletedAt: Date
}

interface GetByCodeAndScaleOptions {
  code: string
  scale: number
  tenantId: string
}

interface GetPageOptions {
  pagination?: Pagination
  sortOrder?: SortOrder
  tenantId?: string
}

export interface AssetService {
  create(options: CreateOptions): Promise<Asset | AssetError>
  update(options: UpdateOptions): Promise<Asset | AssetError>
  delete(options: DeleteOptions): Promise<Asset | AssetError>
  get(id: string, tenantId?: string): Promise<void | Asset>
  getByCodeAndScale(options: GetByCodeAndScaleOptions): Promise<void | Asset>
  getPage(options: GetPageOptions): Promise<Asset[]>
  getAll(): Promise<Asset[]>
}

interface ServiceDependencies extends BaseService {
  config: IAppConfig
  accountingService: AccountingService
  tenantSettingService: TenantSettingService
  assetCache: CacheDataStore<Asset>
}

export async function createAssetService({
  config,
  logger,
  knex,
  accountingService,
  tenantSettingService,
  assetCache
}: ServiceDependencies): Promise<AssetService> {
  const log = logger.child({
    service: 'AssetService'
  })

  const deps: ServiceDependencies = {
    config,
    logger: log,
    knex,
    accountingService,
    tenantSettingService,
    assetCache
  }

  return {
    create: (options) => createAsset(deps, options),
    update: (options) => updateAsset(deps, options),
    delete: (options) => deleteAsset(deps, options),
    get: (id, tenantId) => getAsset(deps, id, tenantId),
    getByCodeAndScale: (options) => getAssetByCodeAndScale(deps, options),
    getPage: (options) => getAssetsPage(deps, options),
    getAll: () => getAll(deps)
  }
}

async function createAsset(
  deps: ServiceDependencies,
  {
    code,
    scale,
    withdrawalThreshold,
    liquidityThreshold,
    tenantId
  }: CreateOptions
): Promise<Asset | AssetError> {
  try {
    const assets = await Asset.query(deps.knex)
      .andWhere('tenantId', tenantId)
      .select('*')

    const sameCodeAssets = assets.find((asset) => asset.code === code)
    if (!sameCodeAssets && assets.length > 0) {
      const exchangeUrlSetting = await deps.tenantSettingService.get({
        tenantId,
        key: TenantSettingKeys.EXCHANGE_RATES_URL.name
      })

      const tenantExchangeRatesUrl = exchangeUrlSetting[0]?.value
      if (!tenantExchangeRatesUrl && !deps.config.operatorExchangeRatesUrl) {
        return AssetError.NoRatesForAsset
      }
    }

    const deletedAsset = assets.find(
      (asset) =>
        asset.deletedAt !== null && asset.code === code && asset.scale === scale
    )

    if (deletedAsset) {
      // if found, enable
      const reActivated = await Asset.query(deps.knex)
        .patchAndFetchById(deletedAsset.id, { deletedAt: null })
        .throwIfNotFound()
      await deps.assetCache.set(reActivated.id, reActivated)
      return reActivated
    }

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
        tenantId,
        withdrawalThreshold,
        liquidityThreshold
      })
      await deps.assetCache.set(asset.id, asset)
      await deps.accountingService.createLiquidityAndLinkedSettlementAccount(
        asset,
        LiquidityAccountType.ASSET,
        trx
      )
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
  { id, tenantId, withdrawalThreshold, liquidityThreshold }: UpdateOptions
): Promise<Asset | AssetError> {
  if (!deps.knex) {
    throw new Error('Knex undefined')
  }
  try {
    const asset = await Asset.query(deps.knex)
      .where({ tenantId })
      .patchAndFetchById(id, {
        withdrawalThreshold,
        liquidityThreshold
      })
      .throwIfNotFound()

    await deps.assetCache.set(id, asset)
    return asset
  } catch (err) {
    if (err instanceof NotFoundError) {
      return AssetError.UnknownAsset
    }
    throw err
  }
}

// soft delete
async function deleteAsset(
  deps: ServiceDependencies,
  options: DeleteOptions
): Promise<Asset | AssetError> {
  const { id, tenantId, deletedAt } = options
  if (!deps.knex) {
    throw new Error('Knex undefined')
  }

  // Check the correct tenant is requesting delete operation
  const existingAsset = await getAsset(deps, id, tenantId)

  if (!existingAsset) {
    return AssetError.UnknownAsset
  }

  await deps.assetCache.delete(id)
  try {
    // return error in case there is a peer or wallet address using the asset
    const peer = await Peer.query(deps.knex).where('assetId', id).first()
    if (peer) {
      return AssetError.CannotDeleteInUseAsset
    }

    const walletAddress = await WalletAddress.query(deps.knex)
      .where('assetId', id)
      .first()
    if (walletAddress) {
      return AssetError.CannotDeleteInUseAsset
    }
    return await Asset.query(deps.knex)
      .patchAndFetchById(id, { deletedAt: deletedAt.toISOString() })
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
  id: string,
  tenantId?: string
): Promise<void | Asset> {
  const inMem = await deps.assetCache.get(id)
  if (inMem) {
    return tenantId && inMem.tenantId !== tenantId ? undefined : inMem
  }

  const query = Asset.query(deps.knex).whereNull('deletedAt')

  if (tenantId) {
    query.andWhere({ tenantId })
  }

  const asset = await query.findById(id)

  if (asset) await deps.assetCache.set(asset.id, asset)

  return asset
}

async function getAssetByCodeAndScale(
  deps: ServiceDependencies,
  options: GetByCodeAndScaleOptions
): Promise<void | Asset> {
  return await Asset.query(deps.knex).where(options).first()
}

async function getAssetsPage(
  deps: ServiceDependencies,
  options: GetPageOptions
): Promise<Asset[]> {
  const { tenantId, pagination, sortOrder } = options

  const query = Asset.query(deps.knex).whereNull('deletedAt')

  if (tenantId) {
    query.andWhere({ tenantId })
  }

  return await query.getPage(pagination, sortOrder)
}

// This used in auto-peering, what to do?
async function getAll(deps: ServiceDependencies): Promise<Asset[]> {
  return await Asset.query(deps.knex).whereNull('deletedAt')
}
