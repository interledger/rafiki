import { GraphQLErrorCode } from '../graphql/errors'

export enum WebhookError {
  UnknownWebhookEvent = 'UnknownWebhookEvent'
}

export const errorToCode: {
  [key in WebhookError]: GraphQLErrorCode
} = {
  [WebhookError.UnknownWebhookEvent]: GraphQLErrorCode.NotFound
}

export const errorToMessage: {
  [key in WebhookError]: string
} = {
  [WebhookError.UnknownWebhookEvent]: 'unknown webhook event'
}
