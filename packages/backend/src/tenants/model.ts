import { Model } from 'objection'
import { BaseModel } from '../shared/baseModel'
import { TenantSetting } from './settings/model'

export class Tenant extends BaseModel {
  public static get tableName(): string {
    return 'tenants'
  }

  public static get relationMappings() {
    return {
      settings: {
        relation: Model.HasManyRelation,
        modelClass: TenantSetting,
        join: {
          from: 'tenants.id',
          to: 'tenantSettings.tenantId'
        }
      }
    }
  }

  public email!: string
  public apiSecret!: string
  public publicName?: string

  public settings!: TenantSetting[]
}
