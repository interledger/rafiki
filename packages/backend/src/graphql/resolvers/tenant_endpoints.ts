import { ApolloContext } from '../../app'
import { Pagination, SortOrder } from '../../shared/baseModel'
import { getPageInfo } from '../../shared/pagination'
import { EndpointType, TenantEndpoint } from '../../tenant/endpoints/model'
import {
  ResolversTypes,
  TenantResolvers,
  TenantEndpoint as SchemaTenantEndpoint,
  TenantEndpointType
} from '../generated/graphql'

export const mapTenantEndpointTypeToModelEndpointType = {
  [EndpointType.RatesUrl]: TenantEndpointType.RatesUrl,
  [EndpointType.WebhookBaseUrl]: TenantEndpointType.WebhookBaseUrl
}

export const getTenantEndpoints: TenantResolvers<ApolloContext>['endpoints'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['TenantEndpointsConnection']> => {
    if (!parent.id) {
      throw new Error('missing tenant id')
    }
    const tenantEndpointService = await ctx.container.use(
      'tenantEndpointService'
    )

    const { sortOrder, ...pagination } = args
    const order = sortOrder === 'ASC' ? SortOrder.Asc : SortOrder.Desc

    const tenantEndpoints = await tenantEndpointService.getPage(
      parent.id,
      pagination,
      order
    )

    const pageInfo = await getPageInfo({
      getPage: (pagination_?: Pagination, sortOrder_?: SortOrder) =>
        tenantEndpointService.getPage(parent.id!, pagination_, sortOrder_),
      page: tenantEndpoints
    })

    return {
      pageInfo,
      edges: tenantEndpoints.map((endpoint: TenantEndpoint) => ({
        cursor: `${endpoint.tenantId}${endpoint.type}`,
        node: tenantEndpointToGraphql(endpoint)
      }))
    }
  }

export function tenantEndpointToGraphql(
  tenantEndpoint: TenantEndpoint
): SchemaTenantEndpoint {
  return {
    type: mapTenantEndpointTypeToModelEndpointType[tenantEndpoint.type],
    value: tenantEndpoint.value
  }
}
