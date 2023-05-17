import { ApolloContext } from '../../app'
import {
  QueryResolvers,
  ResolversTypes,
  WebhookEvent as SchemaWebhookEvent
} from '../generated/graphql'
import { getPageInfo } from '../../shared/pagination'
import { Pagination } from '../../shared/baseModel'
import { WebhookEvent } from '../../webhook/model'

export const getWebhookEvents: QueryResolvers<ApolloContext>['webhookEvents'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['WebhookEventsConnection']> => {
    const webhookService = await ctx.container.use('webhookService')
    const webhookEvents = await webhookService.getPage(args.input.pagination)
    const pageInfo = await getPageInfo(
      (pagination: Pagination) => webhookService.getPage(pagination),
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
  data: JSON.stringify(webhookEvent.data),
  createdAt: new Date(+webhookEvent.createdAt).toISOString()
})
