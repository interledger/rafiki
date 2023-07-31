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

  public id!: string
  public assetId!: string
  public type!: FeeType
  public createdAt!: Date
  public fixedFee!: bigint
  public percentageFee!: string
}
