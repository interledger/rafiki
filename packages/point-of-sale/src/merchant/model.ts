import { BaseModel } from '../shared/baseModel'
import { Model } from 'objection'
import { join } from 'path'

export class Merchant extends BaseModel {
  public static get tableName(): string {
    return 'merchants'
  }

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  static relationMappings = () => ({
    devices: {
      relation: Model.HasManyRelation,
      modelClass: join(__dirname, './devices/model'),
      join: {
        from: 'merchants.id',
        to: 'posDevices.merchantId'
      }
    }
  })

  public name!: string
  public deletedAt?: Date | null
}
