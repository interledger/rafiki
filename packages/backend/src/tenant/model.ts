import { Model } from 'objection'
import { BaseModel } from '../shared/baseModel'
import { TenantEndpoint } from './endpoints/model'

export class Tenant extends BaseModel {
  public static get tableName(): string {
    return 'tenants'
  }

  public static get relationMappings() {
    return {
      endpoints: {
        relation: Model.HasManyRelation,
        modelClass: TenantEndpoint,
        join: {
          from: 'tenants.id',
          to: 'tenantEndpoints.tenantId'
        }
      }
    }
  }

  public email!: string
  public kratosIdentityId!: string
  public deletedAt?: Date
  public endpoints!: TenantEndpoint[]
}

export enum EndpointType {
  WebhookBaseUrl = 'WebhookBaseUrl',
  RatesUrl = 'RatesUrl'
}
