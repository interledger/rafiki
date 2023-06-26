import { ApolloContext } from '../../app'
import {
  QueryResolvers,
  ResolversTypes,
  WebhookEvent as SchemaWebhookEvent
} from '../generated/graphql'
import { getPageInfo } from '../../shared/pagination'
import { WebhookEvent } from '../../webhook/model'
import { Pagination } from '../../shared/baseModel'

export const getWebhookEvents: QueryResolvers<ApolloContext>['webhookEvents'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['WebhookEventsConnection']> => {
    const { filter, ...pagination } = args
    const webhookService = await ctx.container.use('webhookService')
    const getPageFn = (pagination_: Pagination) =>
      webhookService.getPage({ pagination: pagination_, filter })
    const webhookEvents = await getPageFn(pagination)
    const pageInfo = await getPageInfo(
      (pagination_: Pagination) => getPageFn(pagination_),
      webhookEvents
    )
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
  createdAt: new Date(webhookEvent.createdAt).toISOString()
})
