import { Model } from 'objection'

import { Account as BaseAccount } from '../../accounting/service'
import { Asset } from '../../asset/model'
import { BaseModel } from '../../shared/baseModel'

export class Account extends BaseModel implements BaseAccount {
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

  public readonly assetId!: string
  public asset!: Asset
}
