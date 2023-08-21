import { Asset } from '../asset/model'
import { BaseModel } from '../shared/baseModel'

export enum FeeType {
  Sending = 'SENDING',
  Receiving = 'RECEIVING'
}

export class Fee extends BaseModel {
  public static get tableName(): string {
    return 'fees'
  }

  public static get relationMappings() {
    return {
      asset: {
        relation: BaseModel.BelongsToOneRelation,
        modelClass: `${__dirname}/../asset/model`,
        join: {
          from: 'fees.assetId',
          to: 'assets.id'
        }
      }
    }
  }

  public assetId!: string
  public type!: FeeType
  public fixedFee!: bigint
  public basisPointFee!: number
  public asset!: Asset
}
