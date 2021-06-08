import { BaseModel } from './base'

export class User extends BaseModel {
  public static get tableName(): string {
    return 'users'
  }
}
