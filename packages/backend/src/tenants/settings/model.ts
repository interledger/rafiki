import { WeakModel } from '../../shared/baseModel'

export class TenantSetting extends WeakModel {
  public static get tableName(): string {
    return 'tenantSettings'
  }

  public key!: string
  public value!: string
  public tenantId!: string
}
