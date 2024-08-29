import { WeakModel } from '../../shared/baseModel'

export enum EndpointType {
  WebhookBaseUrl = 'WebhookBaseUrl',
  RatesUrl = 'RatesUrl'
}

export class TenantEndpoint extends WeakModel {
  public static get tableName(): string {
    return 'tenantEndpoints'
  }

  public type!: EndpointType
  public value!: string
  public tenantId!: string
}
