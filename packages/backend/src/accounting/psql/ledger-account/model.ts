import { Model } from 'objection'
import { Asset } from '../../../asset/model'
import { BaseModel } from '../../../shared/baseModel'
import { AccountType } from '../../service'

export class LedgerAccount extends BaseModel {
  public static get tableName(): string {
    return 'ledgerAccounts'
  }

  public readonly id!: string
  public readonly accountRef!: string
  public readonly assetId!: string
  public readonly type!: AccountType
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
