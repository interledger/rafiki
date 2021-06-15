import { BaseModel } from '../shared/baseModel'

export class User extends BaseModel {
  public static get tableName(): string {
    return 'users'
  }

  public accountId!: string
}
