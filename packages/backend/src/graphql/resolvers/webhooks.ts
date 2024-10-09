import { ApolloContext } from '../../app'
import {
  QueryResolvers,
  ResolversTypes,
  WebhookEvent as SchemaWebhookEvent,
  WebhookEventType
} from '../generated/graphql'
import { getPageInfo } from '../../shared/pagination'
import { WebhookEvent } from '../../webhook/model'
import { Pagination, SortOrder } from '../../shared/baseModel'
import { GraphQLError } from 'graphql'

export const getWebhookEvents: QueryResolvers<ApolloContext>['webhookEvents'] =
  async (
    parent,
    args,
    ctx
  ): Promise<ResolversTypes['WebhookEventsConnection']> => {
    const { filter, sortOrder, ...pagination } = args
    const order = sortOrder === 'ASC' ? SortOrder.Asc : SortOrder.Desc
    const webhookService = await ctx.container.use('webhookService')
    const getPageFn = (pagination_: Pagination, sortOrder_?: SortOrder) =>
      webhookService.getPage({
        pagination: pagination_,
        filter,
        sortOrder: sortOrder_
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
  type: webhookEventTypeGraphqlMapper(webhookEvent.type),
  data: webhookEvent.data,
  createdAt: new Date(webhookEvent.createdAt).toISOString()
})

export function webhookEventTypeGraphqlMapper(type: string): WebhookEventType {
  switch (type) {
    case 'incoming_payment.created':
      return WebhookEventType.IncomingPaymentCreated
    case 'incoming_payment.completed':
      return WebhookEventType.IncomingPaymentCompleted
    case 'incoming_payment.expired':
      return WebhookEventType.IncomingPaymentExpired
    case 'outgoing_payment.created':
      return WebhookEventType.OutgoingPaymentCreated
    case 'outgoing_payment.completed':
      return WebhookEventType.OutgoingPaymentCompleted
    case 'outgoing_payment.failed':
      return WebhookEventType.OutgoingPaymentFailed
    case 'wallet_address.not_found':
      return WebhookEventType.WalletAddressNotFound
    case 'wallet_address.web_monetization':
      return WebhookEventType.WalletAddressWebMonetization
    case 'asset.liquidity_low':
      return WebhookEventType.AssetLiquidityLow
    case 'peer.liquidity_low':
      return WebhookEventType.PeerLiquidityLow
    default:
      throw new GraphQLError('Webhook event type is not allowed')
  }
}
