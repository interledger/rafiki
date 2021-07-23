import { BaseModel } from '../../shared/baseModel'

export class IlpHttpToken extends BaseModel {
  public static get tableName(): string {
    return 'ilpHttpTokens'
  }

  public readonly token!: string
  public readonly accountId!: string
}
