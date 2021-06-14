import { BaseModel } from './base'

export class Token extends BaseModel {
  public static get tableName(): string {
    return 'tokens'
  }

  public readonly token!: string
  public readonly accountId!: string
}
