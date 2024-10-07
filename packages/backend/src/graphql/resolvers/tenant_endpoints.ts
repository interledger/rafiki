import { EndpointType, TenantEndpoint } from '../../tenant/endpoints/model'
import {
  TenantEndpoint as SchemaTenantEndpoint,
  TenantEndpointType
} from '../generated/graphql'

export const mapTenantEndpointTypeToModelEndpointType = {
  [EndpointType.RatesUrl]: TenantEndpointType.RatesUrl,
  [EndpointType.WebhookBaseUrl]: TenantEndpointType.WebhookBaseUrl
}

export function tenantEndpointToGraphql(
  tenantEndpoint: TenantEndpoint
): SchemaTenantEndpoint {
  return {
    type: mapTenantEndpointTypeToModelEndpointType[tenantEndpoint.type],
    value: tenantEndpoint.value
  }
}
