import { BaseModel } from './base'

export class IlpAccount extends BaseModel {
  public static get tableName(): string {
    return 'ilpAccounts'
  }

  public disabled!: boolean
}
