import { BaseModel } from '../shared/baseModel'

export class Tenant extends BaseModel {
  public static get tableName(): string {
    return 'tenants'
  }

  public apiSecret!: string

  public idpConsentUrl?: string
  public idpSecret?: string

  public deletedAt?: Date
}

export interface TenantWithIdp extends Tenant {
  idpConsentUrl: NonNullable<Tenant['idpConsentUrl']>
  idpSecret: NonNullable<Tenant['idpSecret']>
}

export function isTenantWithIdp(tenant: Tenant): tenant is TenantWithIdp {
  return !!(tenant.idpConsentUrl && tenant.idpSecret)
}
