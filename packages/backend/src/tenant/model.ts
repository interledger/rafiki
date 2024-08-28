import { BaseModel, WeakModel } from '../shared/baseModel'

// export type EndpointType = 'WebhookBaseUrl' | 'RatesUrl'
export enum EndpointType {
  WebhookBaseUrl = 'WebhookBaseUrl',
  RatesUrl = 'RatesUrl'
}

export class Tenant extends BaseModel {
  public static get tableName(): string {
    return 'tenants'
  }

  public kratosIdentityId!: string
  public deletedAt?: Date
}

export class TenantEndpoints extends WeakModel {
  public static get tableName(): string {
    return 'tenantEndpoints'
  }

  public static get relationMappings() {
    return {
      tenant: {
        relation: WeakModel.HasOneRelation,
        modelClass: Tenant,
        join: {
          from: 'tenantEndpoints.tenantId',
          to: 'tenants.id'
        }
      }
    }
  }

  public type!: EndpointType
  public value!: string
  public tenantId!: Tenant
}
