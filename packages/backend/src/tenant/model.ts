<<<<<<< HEAD
import { Model } from 'objection'
import { BaseModel, WeakModel } from '../shared/baseModel'
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

  public kratosIdentityId!: string
  public deletedAt?: Date
  public endpoints!: TenantEndpoint[]
}
=======
import { BaseModel } from "../shared/baseModel";

export enum EndpointType {
    WebhookBaseUrl,
    RatesEndpoint
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

    public type!: EndpointType;
    public value!: string
    public tenant!: Tenant;
}

>>>>>>> 51ad9b99 (feat(tenant): basic tenant admin api schema and service)
