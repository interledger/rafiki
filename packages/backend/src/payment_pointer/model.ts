import { Model } from 'objection'

import { Asset } from '../asset/model'
import { BaseModel } from '../shared/baseModel'

export class PaymentPointer extends BaseModel {
  public static get tableName(): string {
    return 'paymentPointers'
  }

  static relationMappings = {
    asset: {
      relation: Model.HasOneRelation,
      modelClass: Asset,
      join: {
        from: 'paymentPointers.assetId',
        to: 'assets.id'
      }
    }
  }

  public readonly assetId!: string
  public asset!: Asset
}
