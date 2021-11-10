import { Asset, AssetAccounts } from './model'
import { BaseService } from '../shared/baseService'
import { Transaction } from 'knex'
import { BalanceType } from '../balance/service'
import { Account } from '../account/model'
import { AccountService } from '../account/service'

export interface AssetOptions {
  code: string
  scale: number
}

export interface AssetService {
  get(asset: AssetOptions, trx?: Transaction): Promise<void | Asset>
  getOrCreate(asset: AssetOptions): Promise<Asset>
  getById(id: string, trx?: Transaction): Promise<void | Asset>
  getLiquidityAccount(assetId: string): Promise<Account | undefined>
}

interface ServiceDependencies extends BaseService {
  accountService: AccountService
}

export async function createAssetService({
  logger,
  knex,
  accountService
}: ServiceDependencies): Promise<AssetService> {
  const log = logger.child({
    service: 'AssetService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    knex,
    accountService
  }
  return {
    get: (asset, trx) => getAsset(deps, asset, trx),
    getOrCreate: (asset) => getOrCreateAsset(deps, asset),
    getById: (id, trx) => getAssetById(deps, id, trx),
    getLiquidityAccount: (assetId) => getAssetLiquidityAccount(deps, assetId)
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
  { code, scale }: AssetOptions
): Promise<Asset> {
  const asset = await Asset.query(deps.knex).findOne({ code, scale })
  if (asset) {
    return asset
  } else {
    // Asset rows include a smallserial 'unit' column that would have sequence gaps
    // if a transaction is rolled back.
    // https://www.postgresql.org/docs/current/datatype-numeric.html#DATATYPE-SERIAL
    //
    // However, we need to know the 'unit' column value from the inserted asset row
    // before we can create the liquidity and settlement tigerbeetle balances.
    return await Asset.transaction(async (trx) => {
      const asset = await Asset.query(trx).insertAndFetch({
        code,
        scale
      })
      const { id: liquidityAccountId } = await deps.accountService.create(
        {
          assetId: asset.id,
          balanceType: BalanceType.Credit
        },
        trx
      )
      const { id: settlementAccountId } = await deps.accountService.create(
        {
          assetId: asset.id,
          balanceType: BalanceType.Debit
        },
        trx
      )
      const { id: sentAccountId } = await deps.accountService.create(
        {
          assetId: asset.id,
          balanceType: BalanceType.Debit
        },
        trx
      )
      const { id: receiveLimitAccountId } = await deps.accountService.create(
        {
          assetId: asset.id,
          balanceType: BalanceType.Credit
        },
        trx
      )
      await AssetAccounts.query(trx).insert({
        id: asset.id,
        liquidityAccountId,
        settlementAccountId,
        sentAccountId,
        receiveLimitAccountId
      })

      return asset
    })
  }
}

async function getAssetById(
  deps: ServiceDependencies,
  id: string,
  trx?: Transaction
): Promise<void | Asset> {
  return await Asset.query(trx || deps.knex).findById(id)
}

async function getAssetLiquidityAccount(
  deps: ServiceDependencies,
  assetId: string
): Promise<Account | undefined> {
  const asset = await AssetAccounts.query(deps.knex)
    .findById(assetId)
    .withGraphJoined('liquidityAccount.asset')
  if (asset) {
    return asset.liquidityAccount
  }
}
