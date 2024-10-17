import { GraphQLError, ValueNode, Kind } from 'graphql'
import { WebhookEventType } from './WebhookEventType'

describe('Webhook event type scalar works correctly', () => {
  test('Should pass a valid string as a webhook event type', () => {
    const type = 'incoming_payment.created'

    const result = WebhookEventType.serialize(type)
    expect(result).toBe(type)
  })

  test('Should throw an error for non-string value', () => {
    const value = {}

    expect(() => WebhookEventType.serialize(value)).toThrow(GraphQLError)
    expect(() => WebhookEventType.serialize(value)).toThrow(
      'WebhookEventType can only parse strings'
    )
  })

  test('Should throw an error for non-string literals', () => {
    const ast: ValueNode = { kind: Kind.INT, value: 'some_invalid.type' }

    expect(() => WebhookEventType.parseLiteral(ast)).toThrow(GraphQLError)
    expect(() => WebhookEventType.parseLiteral(ast)).toThrow(
      'Webhook event type must be a string'
    )
  })
  test('Should throw error for disallowed types', () => {
    const type = 'some_invalid.type'

    expect(() => WebhookEventType.serialize(type)).toThrow(GraphQLError)
    expect(() => WebhookEventType.serialize(type)).toThrow(
      'Webhook event type not allowed'
    )
  })
})
