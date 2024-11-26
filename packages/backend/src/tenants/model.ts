import { BaseModel } from '../shared/baseModel'

export class Tenant extends BaseModel {
  public static get tableName(): string {
    return 'tenants'
  }

  public email!: string
  public apiSecret!: string
  public publicName?: string
}
