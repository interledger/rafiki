import { TenantEndpointType } from '../graphql/generated/graphql'
import { BaseModel } from '../shared/baseModel'

export enum EndpointType {
  WebhookBaseUrl = 'WebhookBaseUrl',
  RatesUrl = 'RatesUrl'
}

export class Tenant extends BaseModel {
  public static getTableName(): string {
    return 'tenants'
  }
}

export class TenantEndpoints extends BaseModel {
  public static get tableName(): string {
    return 'tenantEndpoints'
  }

  public static get relationMappings() {
    return {
      tenant: {
        relation: BaseModel.HasOneRelation,
        modelClass: Tenant,
        join: {
          from: 'tenantEndpoints.tenantId',
          to: 'tenants.id'
        }
      }
    }
  }

  public type!: TenantEndpointType
  public value!: string
  public tenant!: Tenant
}
