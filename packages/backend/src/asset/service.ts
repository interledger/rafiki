import { Asset } from './model'
import { BaseService } from '../shared/baseService'
import { Transaction } from 'knex'
import { BalanceService } from '../balance/service'

export interface AssetOptions {
  code: string
  scale: number
}

export interface AssetService {
  get(asset: AssetOptions, trx?: Transaction): Promise<void | Asset>
  getOrCreate(asset: AssetOptions): Promise<Asset>
  getById(id: string, trx?: Transaction): Promise<void | Asset>
  getLiquidityBalance(
    asset: AssetOptions,
    trx?: Transaction
  ): Promise<bigint | undefined>
  getSettlementBalance(
    asset: AssetOptions,
    trx?: Transaction
  ): Promise<bigint | undefined>
  getOutgoingPaymentsBalance(
    asset: AssetOptions,
    trx?: Transaction
  ): Promise<bigint | undefined>
}

interface ServiceDependencies extends BaseService {
  balanceService: BalanceService
}

export async function createAssetService({
  logger,
  knex,
  balanceService
}: ServiceDependencies): Promise<AssetService> {
  const log = logger.child({
    service: 'AssetService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    knex,
    balanceService
  }
  return {
    get: (asset, trx) => getAsset(deps, asset, trx),
    getOrCreate: (asset) => getOrCreateAsset(deps, asset),
    getById: (id, trx) => getAssetById(deps, id, trx),
    getLiquidityBalance: (asset, trx) => getLiquidityBalance(deps, asset, trx),
    getSettlementBalance: (asset, trx) =>
      getSettlementBalance(deps, asset, trx),
    getOutgoingPaymentsBalance: (asset, trx) =>
      getOutgoingPaymentsBalance(deps, asset, trx)
  }
}

async function getAsset(
  deps: ServiceDependencies,
  { code, scale }: AssetOptions,
  trx?: Transaction
): Promise<void | Asset> {
  return await Asset.query(trx || deps.knex)
    .where({ code, scale })
    .limit(1)
    .first()
}

async function getOrCreateAsset(
  deps: ServiceDependencies,
  { code, scale }: AssetOptions
): Promise<Asset> {
  const asset = await Asset.query(deps.knex)
    .where({ code, scale })
    .limit(1)
    .first()
  if (asset) {
    return asset
  } else {
    // Asset rows include a smallserial 'unit' column that would have sequence gaps
    // if a transaction is rolled back.
    // https://www.postgresql.org/docs/current/datatype-numeric.html#DATATYPE-SERIAL
    //
    // However, we need to know the 'unit' column value from the inserted asset row
    // before we can create the liquidity and settlement tigerbeetle balances,
    // and we don't want to have invalid balance id(s) in the the asset row if the
    // tigerbeetle balance creation fails.
    //
    // If tigerbeetle supported patching a balance's 'unit', we could:
    // 1) create the tigerbeetle balances with empty 'unit's
    // 2) insert new asset row
    // 3) patch the tigerbeetle balance 'unit's
    return await Asset.transaction(async (trx) => {
      const asset = await Asset.query(trx).insertAndFetch({
        code,
        scale
      })
      await deps.balanceService.create([
        {
          id: asset.liquidityBalanceId,
          unit: asset.unit
        },
        {
          id: asset.settlementBalanceId,
          debitBalance: true,
          unit: asset.unit
        },
        {
          id: asset.outgoingPaymentsBalanceId,
          debitBalance: true,
          unit: asset.unit
        }
      ])
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

async function getLiquidityBalance(
  deps: ServiceDependencies,
  { code, scale }: AssetOptions,
  trx?: Transaction
): Promise<bigint | undefined> {
  const asset = await Asset.query(trx || deps.knex)
    .where({ code, scale })
    .first()
    .select('liquidityBalanceId')
  if (asset) {
    const balances = await deps.balanceService.get([asset.liquidityBalanceId])
    if (balances.length === 1) {
      return balances[0].balance
    } else {
      deps.logger.warn({ asset }, 'missing liquidity balance')
    }
  }
}

async function getSettlementBalance(
  deps: ServiceDependencies,
  { code, scale }: AssetOptions,
  trx?: Transaction
): Promise<bigint | undefined> {
  const asset = await Asset.query(trx)
    .where({ code, scale })
    .first()
    .select('settlementBalanceId')
  if (asset) {
    const balances = await deps.balanceService.get([asset.settlementBalanceId])
    if (balances.length === 1) {
      return balances[0].balance
    } else {
      deps.logger.warn({ asset }, 'missing settlement balance')
    }
  }
}

async function getOutgoingPaymentsBalance(
  deps: ServiceDependencies,
  { code, scale }: AssetOptions,
  trx?: Transaction
): Promise<bigint | undefined> {
  const asset = await Asset.query(trx)
    .where({ code, scale })
    .first()
    .select('outgoingPaymentsBalanceId')
  if (asset) {
    const balances = await deps.balanceService.get([
      asset.outgoingPaymentsBalanceId
    ])
    if (balances.length === 1) {
      return balances[0].balance
    } else {
      deps.logger.warn({ asset }, 'missing outgoing payments balance')
    }
  }
}
