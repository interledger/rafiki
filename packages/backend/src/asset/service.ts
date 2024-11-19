import { NotFoundError, UniqueViolationError } from 'objection'

import { AssetError } from './errors'
import { Asset } from './model'
import { Pagination, SortOrder } from '../shared/baseModel'
import { BaseService } from '../shared/baseService'
import { AccountingService, LiquidityAccountType } from '../accounting/service'
import { WalletAddress } from '../open_payments/wallet_address/model'
import { Peer } from '../payment-method/ilp/peer/model'
import { Quote } from '../open_payments/quote/model'
import { IncomingPayment } from '../open_payments/payment/incoming/model'
import { CacheDataStore } from '../middleware/cache/data-stores'

export interface AssetOptions {
  code: string
  scale: number
}

export interface CreateOptions extends AssetOptions {
  withdrawalThreshold?: bigint
  liquidityThreshold?: bigint
}

export interface UpdateOptions {
  id: string
  withdrawalThreshold: bigint | null
  liquidityThreshold: bigint | null
}
export interface DeleteOptions {
  id: string
  deletedAt: Date
}

export type ToSetOn = Quote | IncomingPayment | WalletAddress | Peer | undefined

export interface AssetService {
  create(options: CreateOptions): Promise<Asset | AssetError>
  update(options: UpdateOptions): Promise<Asset | AssetError>
  delete(options: DeleteOptions): Promise<Asset | AssetError>
  get(id: string): Promise<void | Asset>
  getByCodeAndScale(code: string, scale: number): Promise<void | Asset>
  setOn(obj: ToSetOn): Promise<void | Asset>
  getPage(pagination?: Pagination, sortOrder?: SortOrder): Promise<Asset[]>
  getAll(): Promise<Asset[]>
}

interface ServiceDependencies extends BaseService {
  accountingService: AccountingService
  cacheDataStore: CacheDataStore<Asset>
}

export async function createAssetService({
  logger,
  knex,
  accountingService,
  cacheDataStore
}: ServiceDependencies): Promise<AssetService> {
  const log = logger.child({
    service: 'AssetService'
  })

  const deps: ServiceDependencies = {
    logger: log,
    knex,
    accountingService,
    cacheDataStore
  }

  return {
    create: (options) => createAsset(deps, options),
    update: (options) => updateAsset(deps, options),
    delete: (options) => deleteAsset(deps, options),
    get: (id) => getAsset(deps, id),
    getByCodeAndScale: (code, scale) =>
      getAssetByCodeAndScale(deps, code, scale),
    setOn: (toSetOn) => setAssetOn(deps, toSetOn),
    getPage: (pagination?, sortOrder?) =>
      getAssetsPage(deps, pagination, sortOrder),
    getAll: () => getAll(deps)
  }
}

async function createAsset(
  deps: ServiceDependencies,
  { code, scale, withdrawalThreshold, liquidityThreshold }: CreateOptions
): Promise<Asset | AssetError> {
  try {
    // check if exists but deleted | by code-scale
    const deletedAsset = await Asset.query(deps.knex)
      .whereNotNull('deletedAt')
      .where('code', code)
      .andWhere('scale', scale)
      .first()

    if (deletedAsset) {
      await deps.cacheDataStore.delete(deletedAsset.id)

      // if found, enable
      return await Asset.query(deps.knex)
        .patchAndFetchById(deletedAsset.id, { deletedAt: null })
        .throwIfNotFound()
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
        withdrawalThreshold,
        liquidityThreshold
      })
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
  { id, withdrawalThreshold, liquidityThreshold }: UpdateOptions
): Promise<Asset | AssetError> {
  if (!deps.knex) {
    throw new Error('Knex undefined')
  }
  try {
    const asset = await Asset.query(deps.knex)
      .patchAndFetchById(id, { withdrawalThreshold, liquidityThreshold })
      .throwIfNotFound()

    await deps.cacheDataStore.set(id, asset)
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
  { id, deletedAt }: DeleteOptions
): Promise<Asset | AssetError> {
  if (!deps.knex) {
    throw new Error('Knex undefined')
  }

  await deps.cacheDataStore.delete(id)
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
  id: string
): Promise<void | Asset> {
  const inMem = (await deps.cacheDataStore.get(id)) as Asset
  if (inMem) return inMem

  const asset = await Asset.query(deps.knex).whereNull('deletedAt').findById(id)
  if (asset) await deps.cacheDataStore.set(asset.id, asset)

  return asset
}

async function getAssetByCodeAndScale(
  deps: ServiceDependencies,
  code: string,
  scale: number
): Promise<void | Asset> {
  return await Asset.query(deps.knex)
    .where({ code: code, scale: scale })
    .first()
}

async function getAssetsPage(
  deps: ServiceDependencies,
  pagination?: Pagination,
  sortOrder?: SortOrder
): Promise<Asset[]> {
  return await Asset.query(deps.knex)
    .whereNull('deletedAt')
    .getPage(pagination, sortOrder)
}

async function getAll(deps: ServiceDependencies): Promise<Asset[]> {
  return await Asset.query(deps.knex).whereNull('deletedAt')
}

async function setAssetOn(
  deps: ServiceDependencies,
  obj: ToSetOn
): Promise<void | Asset> {
  if (!obj) return
  const asset = await getAsset(deps, obj.assetId)
  if (asset) obj.asset = asset
  return asset
}
