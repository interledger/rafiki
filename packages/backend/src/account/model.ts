import { BaseModel } from '../shared/baseModel'
import { Asset } from '../asset/model'
import { Model } from 'objection'

export class Account extends BaseModel {
  public static get tableName(): string {
    return 'accounts'
  }

  static relationMappings = {
    asset: {
      relation: Model.HasOneRelation,
      modelClass: Asset,
      join: {
        from: 'accounts.assetId',
        to: 'assets.id'
      }
    }
  }

  public readonly disabled!: boolean

  public readonly assetId!: string
  public asset!: Asset
  // TigerBeetle account id tracking Interledger balance
  public readonly balanceId!: string
  // TigerBeetle account id tracking amount sent
  public readonly sentBalanceId?: string

  // TigerBeetle account id tracking an invoice's receive limit.
  // - "credits" is the actual limit.
  // - "debits" is the progress towards that limit.
  public readonly receiveLimitBalanceId?: string
}
