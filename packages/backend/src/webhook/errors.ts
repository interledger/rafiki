import { GraphQLErrorCode } from '../graphql/errors'

export enum WebhookError {
  UnknownWebhookEvent = 'UnknownWebhookEvent',
  UnknownError = 'UnknownError'
}

export const errorToCode: {
  [key in WebhookError]: GraphQLErrorCode
} = {
  [WebhookError.UnknownWebhookEvent]: GraphQLErrorCode.NotFound,
  [WebhookError.UnknownError]: GraphQLErrorCode.InternalServerError
}

export const errorToMessage: {
  [key in WebhookError]: string
} = {
  [WebhookError.UnknownWebhookEvent]: 'unknown webhook event',
  [WebhookError.UnknownError]: 'Internal Server Error'
}
