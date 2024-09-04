import { WeakModel } from '../../shared/baseModel'

export enum EndpointType {
  WebhookBaseUrl = 'WebhookBaseUrl',
  RatesUrl = 'RatesUrl'
}

export class TenantEndpoint extends WeakModel {
  public static get tableName(): string {
    return 'tenantEndpoints'
  }

  // Tell Objection.js that there is no single id column
  // Define the composite primary key
  static get idColumn() {
    return ['tenantId', 'type']
  }

  public type!: EndpointType
  public value!: string
  public tenantId!: string
}
