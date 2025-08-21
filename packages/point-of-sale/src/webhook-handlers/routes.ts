import { AppContext } from '../app'
import { BaseService } from '../shared/baseService'
import { webhookWaitMap } from './request-map'

type ServiceDependencies = BaseService

export type WebhookBody = {
  id: string
  type: string
  data: {
    id: string
    completed: boolean
  } & Record<string, unknown>
}

type HandleWebhookRequest = Exclude<AppContext['request'], 'body'> & {
  body: WebhookBody
}

export type HandleWebhookContext = Exclude<AppContext, 'request'> & {
  request: HandleWebhookRequest
}

export interface WebhookHandlerRoutes {
  handleWebhook(ctx: HandleWebhookContext): Promise<void>
}

export async function createWebhookHandlerRoutes({
  logger
}: ServiceDependencies): Promise<WebhookHandlerRoutes> {
  const log = logger.child({
    service: 'WebhookHandlerRoutes'
  })
  const deps: ServiceDependencies = {
    logger: log
  }

  return {
    handleWebhook: (ctx: HandleWebhookContext) => handleWebhook(deps, ctx)
  }
}

async function handleWebhook(
  deps: ServiceDependencies,
  ctx: HandleWebhookContext
): Promise<void> {
  const {
    type,
    data: { id }
  } = ctx.request.body
  if (type !== 'incoming_payment.completed')
    ctx.throw(400, 'Invalid webhook event type')
  const deferred = webhookWaitMap.get(id)
  if (deferred) {
    deferred.resolve(ctx.request.body)
    ctx.status = 202
  } else {
    ctx.throw(404, 'Not awaiting webhook for incoming payment id')
  }
}
