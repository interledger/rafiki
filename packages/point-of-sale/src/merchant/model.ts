import { BaseModel } from '../shared/baseModel'

export class Merchant extends BaseModel {
  public static get tableName(): string {
    return 'merchants'
  }

  public name!: string
  public deletedAt!: Date | null
}
