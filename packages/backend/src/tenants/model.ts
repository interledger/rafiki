import { BaseModel } from '../shared/baseModel'
import { Pojo } from 'objection'

export class Tenant extends BaseModel {
  public static get tableName(): string {
    return 'tenants'
  }

  public email!: string
  public apiSecret!: string
  public idpConsentUrl!: string
  public idpSecret!: string
  public publicName?: string

  public deletedAt?: Date

  $formatJson(json: Pojo): Pojo {
    json = super.$formatJson(json)
    return {
      ...json,
      deletedAt: json.deletedAt.toISOString()
    }
  }
}

export type TenantWithIdpConfig = Pick<
  Tenant,
  'id' | 'email' | 'apiSecret' | 'publicName' | 'createdAt' | 'updatedAt'
> & {
  idpConsentUrl: string
  idpSecret: string
}
