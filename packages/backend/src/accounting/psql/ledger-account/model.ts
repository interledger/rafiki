import { Model } from 'objection'
import { Asset } from '../../../asset/model'
import { BaseModel } from '../../../shared/baseModel'
import { LiquidityAccountType } from '../../service'

export enum LedgerAccountType {
  LIQUIDITY_ASSET = 'LIQUIDITY_ASSET',
  LIQUIDITY_PEER = 'LIQUIDITY_PEER',
  LIQUIDITY_INCOMING = 'LIQUIDITY_INCOMING',
  LIQUIDITY_OUTGOING = 'LIQUIDITY_OUTGOING',
  LIQUIDITY_WEB_MONETIZATION = 'LIQUIDITY_WEB_MONETIZATION',
  SETTLEMENT = 'SETTLEMENT'
}

export class LedgerAccount extends BaseModel {
  public static get tableName(): string {
    return 'ledgerAccounts'
  }

  public readonly id!: string
  public readonly accountRef!: string
  public readonly assetId!: string
  public readonly type!: LedgerAccountType
  public readonly asset?: Asset

  static relationMappings = {
    asset: {
      relation: Model.HasOneRelation,
      modelClass: Asset,
      join: {
        from: 'ledgerAccounts.assetId',
        to: 'assets.id'
      }
    }
  }
}

export const mapLiquidityAccountTypeToLedgerAccountType: {
  [key in LiquidityAccountType]: LedgerAccountType
} = {
  [LiquidityAccountType.WEB_MONETIZATION]:
    LedgerAccountType.LIQUIDITY_WEB_MONETIZATION,
  [LiquidityAccountType.ASSET]: LedgerAccountType.LIQUIDITY_ASSET,
  [LiquidityAccountType.PEER]: LedgerAccountType.LIQUIDITY_PEER,
  [LiquidityAccountType.INCOMING]: LedgerAccountType.LIQUIDITY_INCOMING,
  [LiquidityAccountType.OUTGOING]: LedgerAccountType.LIQUIDITY_OUTGOING
}
