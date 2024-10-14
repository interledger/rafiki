import { GraphQLScalarType, ValueNode, Kind, GraphQLError } from 'graphql'

const allowedWebhookEventTypes = [
  'incoming_payment.created',
  'incoming_payment.completed',
  'incoming_payment.expired',
  'outgoing_payment.created',
  'outgoing_payment.completed',
  'outgoing_payment.failed',
  'wallet_address.not_found',
  'wallet_address.web_monetization',
  'asset.liquidity_low',
  'peer.liquidity_low'
]

export const WebhookEventType = new GraphQLScalarType<string, string>({
  name: 'WebhookEventType',
  description: 'Webhook event type format (e.g. incoming_payment.created)',
  serialize: parseWebhookEventType,
  parseValue: parseWebhookEventType,
  parseLiteral(ast: ValueNode): string {
    if (ast.kind !== Kind.STRING) {
      throw new GraphQLError('Webhook event type must be a string')
    }
    return parseWebhookEventType(ast.value)
  }
})

function parseWebhookEventType(value: unknown): string {
  if (typeof value !== 'string') {
    throw new GraphQLError('WebhookEventType can only parse strings')
  }
  if (!allowedWebhookEventTypes.includes(value)) {
    throw new GraphQLError('Webhook event type not allowed')
  }
  return value
}
