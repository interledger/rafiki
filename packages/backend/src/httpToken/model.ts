import { BaseModel } from '../shared/baseModel'

export class HttpToken extends BaseModel {
  public static get tableName(): string {
    return 'httpTokens'
  }

  public readonly token!: string
  public readonly accountId!: string
}
