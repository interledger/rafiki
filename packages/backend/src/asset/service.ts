import { NotFoundError, UniqueViolationError } from 'objection'

import { AssetError } from './errors'
import { Asset } from './model'
import { Pagination, SortOrder } from '../shared/baseModel'
import { BaseService } from '../shared/baseService'
import { AccountingService, LiquidityAccountType } from '../accounting/service'
import { WalletAddress } from '../open_payments/wallet_address/model'
import { Peer } from '../payment-method/ilp/peer/model'

export interface AssetOptions {
  code: string
  scale: number
}

export interface CreateOptions extends AssetOptions {
  withdrawalThreshold?: bigint
  liquidityThresholdLow?: bigint
  liquidityThresholdHigh?: bigint | null
}

export interface UpdateOptions {
  id: string
  withdrawalThreshold: bigint | null
  liquidityThresholdLow: bigint | null
  liquidityThresholdHigh?: bigint | null
}
export interface DeleteOptions {
  id: string
  deletedAt: Date
}

export interface AssetService {
  create(options: CreateOptions): Promise<Asset | AssetError>
  update(options: UpdateOptions): Promise<Asset | AssetError>
  delete(options: DeleteOptions): Promise<Asset | AssetError>
  get(id: string): Promise<void | Asset>
  getPage(pagination?: Pagination, sortOrder?: SortOrder): Promise<Asset[]>
  getAll(): Promise<Asset[]>
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
    delete: (options) => deleteAsset(deps, options),
    get: (id) => getAsset(deps, id),
    getPage: (pagination?, sortOrder?) =>
      getAssetsPage(deps, pagination, sortOrder),
    getAll: () => getAll(deps)
  }
}

async function createAsset(
  deps: ServiceDependencies,
  { code, scale, withdrawalThreshold, liquidityThresholdLow, liquidityThresholdHigh }: CreateOptions
): Promise<Asset | AssetError> {
  try {
    // check if exists but deleted | by code-scale
    const deletedAsset = await Asset.query(deps.knex)
      .whereNotNull('deletedAt')
      .where('code', code)
      .andWhere('scale', scale)
      .first()

    if (deletedAsset) {
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
        liquidityThresholdLow,
        liquidityThresholdHigh,
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
  { id, withdrawalThreshold, liquidityThresholdLow, liquidityThresholdHigh }: UpdateOptions
): Promise<Asset | AssetError> {
  if (!deps.knex) {
    throw new Error('Knex undefined')
  }
  try {
    return await Asset.query(deps.knex)
      .patchAndFetchById(id, { withdrawalThreshold, liquidityThresholdLow, liquidityThresholdHigh })
      .throwIfNotFound()
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
  return await Asset.query(deps.knex).whereNull('deletedAt').findById(id)
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
