import { BaseModel } from '../shared/baseModel'

export class Tenant extends BaseModel {
  public static get tableName(): string {
    return 'tenants'
  }

  public idpConsentUrl!: string
  public idpSecret!: string
}
