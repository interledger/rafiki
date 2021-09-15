import {
  BalanceService,
  calculateCreditBalance,
  calculateDebitBalance
} from '../balance/service'
import { BaseService } from '../shared/baseService'
import { Asset as AssetModel } from './model'
import { randomId } from '../shared/utils'

export interface Asset {
  code: string
  scale: number
}

export interface AssetService {
  get(asset: Asset): Promise<void | AssetModel>
  getOrCreate(asset: Asset): Promise<AssetModel>
  getById(id: string): Promise<void | AssetModel>
  getLiquidityBalance(asset: Asset): Promise<bigint | undefined>
  getSettlementBalance(asset: Asset): Promise<bigint | undefined>
}

interface ServiceDependencies extends BaseService {
  balanceService: BalanceService
}

export function createAssetService({
  logger,
  balanceService
}: ServiceDependencies): AssetService {
  const log = logger.child({
    service: 'AssetService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    balanceService
  }
  return {
    get: (asset) => getAsset(deps, asset),
    getOrCreate: (asset) => getOrCreateAsset(deps, asset),
    getById: (id) => getAssetById(deps, id),
    getLiquidityBalance: (asset) => getLiquidityBalance(deps, asset),
    getSettlementBalance: (asset) => getSettlementBalance(deps, asset)
  }
}

async function getAsset(
  deps: ServiceDependencies,
  { code, scale }: Asset
): Promise<void | AssetModel> {
  return await AssetModel.query().where({ code, scale }).limit(1).first()
}

async function getOrCreateAsset(
  deps: ServiceDependencies,
  { code, scale }: Asset
): Promise<AssetModel> {
  const asset = await AssetModel.query().where({ code, scale }).limit(1).first()
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
    return await AssetModel.transaction(async (trx) => {
      const liquidityBalanceId = randomId()
      const settlementBalanceId = randomId()
      const asset = await AssetModel.query(trx).insertAndFetch({
        code,
        scale,
        settlementBalanceId,
        liquidityBalanceId
      })
      await deps.balanceService.create([
        {
          id: liquidityBalanceId,
          unit: asset.unit
        },
        {
          id: settlementBalanceId,
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
  id: string
): Promise<void | AssetModel> {
  return await AssetModel.query().findById(id)
}

async function getLiquidityBalance(
  deps: ServiceDependencies,
  { code, scale }: Asset
): Promise<bigint | undefined> {
  const asset = await AssetModel.query()
    .where({ code, scale })
    .first()
    .select('liquidityBalanceId')
  if (asset) {
    const balances = await deps.balanceService.get([asset.liquidityBalanceId])
    if (balances.length === 1) {
      return calculateCreditBalance(balances[0])
    }
  }
}

async function getSettlementBalance(
  deps: ServiceDependencies,
  { code, scale }: Asset
): Promise<bigint | undefined> {
  const asset = await AssetModel.query()
    .where({ code, scale })
    .first()
    .select('settlementBalanceId')
  if (asset) {
    const balances = await deps.balanceService.get([asset.settlementBalanceId])
    if (balances.length === 1) {
      return calculateDebitBalance(balances[0])
    }
  }
}
