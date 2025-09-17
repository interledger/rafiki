import { TenantedApolloContext } from '../../app'
import {
  QueryResolvers,
  ResolversTypes,
  WebhookEvent as SchemaWebhookEvent
} from '../generated/graphql'
import { getPageInfo } from '../../shared/pagination'
import { WebhookEvent } from '../../webhook/event/model'
import { Pagination, SortOrder } from '../../shared/baseModel'

const DEFAULT_EXCLUDED_TYPES = [
  'outgoing_payment.funded',
  'outgoing_payment.cancelled'
]

export const getWebhookEvents: QueryResolvers<TenantedApolloContext>['webhookEvents'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['WebhookEventsConnection']> => {
    const { filter, sortOrder, tenantId, ...pagination } = args
    const order = sortOrder === 'ASC' ? SortOrder.Asc : SortOrder.Desc
    const webhookService = await ctx.container.use('webhookService')
    const filterOrDefaults = filter ?? {
      type: { notIn: DEFAULT_EXCLUDED_TYPES }
    }
    const getPageFn = (pagination_: Pagination, sortOrder_?: SortOrder) =>
      webhookService.getPage({
        pagination: pagination_,
        filter: filterOrDefaults,
        sortOrder: sortOrder_,
        tenantId: ctx.isOperator ? tenantId : ctx.tenant.id
      })
    const webhookEvents = await getPageFn(pagination, order)
    const pageInfo = await getPageInfo({
      getPage: (pagination_: Pagination, sortOrder_?: SortOrder) =>
        getPageFn(pagination_, sortOrder_),
      page: webhookEvents,
      sortOrder: order
    })
    return {
      pageInfo,
      edges: webhookEvents.map((webhookEvent: WebhookEvent) => ({
        cursor: webhookEvent.id,
        node: webhookEventToGraphql(webhookEvent)
      }))
    }
  }

export const webhookEventToGraphql = (
  webhookEvent: WebhookEvent
): SchemaWebhookEvent => ({
  id: webhookEvent.id,
  type: webhookEvent.type,
  data: webhookEvent.data,
  tenantId: webhookEvent.tenantId,
  createdAt: new Date(webhookEvent.createdAt).toISOString()
})
