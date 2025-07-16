import { TenantedApolloContext } from '../../app'
import {
  QueryResolvers,
  ResolversTypes,
  WebhookEvent as SchemaWebhookEvent,
  WebhookEventResolvers
} from '../generated/graphql'
import { getPageInfo } from '../../shared/pagination'
import { WebhookEvent } from '../../webhook/event/model'
import { Pagination, SortOrder } from '../../shared/baseModel'
import { tenantToGraphQl } from './tenant'
import { GraphQLError } from 'graphql'
import { errorToCode, errorToMessage, WebhookError } from '../../webhook/errors'

export const getWebhookEvents: QueryResolvers<TenantedApolloContext>['webhookEvents'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['WebhookEventsConnection']> => {
    const { filter, sortOrder, tenantId, ...pagination } = args
    const order = sortOrder === 'ASC' ? SortOrder.Asc : SortOrder.Desc
    const webhookService = await ctx.container.use('webhookService')
    const getPageFn = (pagination_: Pagination, sortOrder_?: SortOrder) =>
      webhookService.getPage({
        pagination: pagination_,
        filter,
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

export const getWebhookEventTenant: WebhookEventResolvers<TenantedApolloContext>['tenant'] =
  async (parent, args, ctx): Promise<ResolversTypes['Tenant'] | null> => {
    if (!parent.id) return null
    const webhookService = await ctx.container.use('webhookService')
    const webhookEvent = await webhookService.getEvent(parent.id)
    if (!webhookEvent)
      throw new GraphQLError(errorToMessage[WebhookError.UnknownWebhookEvent], {
        extensions: {
          code: errorToCode[WebhookError.UnknownWebhookEvent]
        }
      })
    const tenantService = await ctx.container.use('tenantService')
    const tenant = await tenantService.get(webhookEvent.tenantId)
    if (!tenant) return null
    return tenantToGraphQl(tenant)
  }

export const webhookEventToGraphql = (
  webhookEvent: WebhookEvent
): SchemaWebhookEvent => ({
  id: webhookEvent.id,
  type: webhookEvent.type,
  data: webhookEvent.data,
  createdAt: new Date(webhookEvent.createdAt).toISOString()
})
