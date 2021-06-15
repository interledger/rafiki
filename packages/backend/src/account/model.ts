import { BaseModel } from '../shared/baseModel'

export class Account extends BaseModel {
  public static get tableName(): string {
    return 'accounts'
  }

  public scale!: number
  public currency!: string
}
