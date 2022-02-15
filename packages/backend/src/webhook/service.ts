import assert from 'assert'
import axios from 'axios'
import { createHmac } from 'crypto'

import { WebhookEvent } from './model'
import { IAppConfig } from '../config/app'
import { BaseService } from '../shared/baseService'

// First retry waits 10 seconds, second retry waits 20 (more) seconds, etc.
export const RETRY_BACKOFF_MS = 10_000
export const RETRY_LIMIT_MS = 60_000 * 60 * 24 // 1 day
export const RETENTION_LIMIT_MS = 60_000 * 60 * 24 * 30 // 30 days

export interface WebhookService {
  getEvent(id: string): Promise<WebhookEvent | undefined>
  processNext(): Promise<string | undefined>
}

interface ServiceDependencies extends BaseService {
  config: IAppConfig
}

export async function createWebhookService(
  deps_: ServiceDependencies
): Promise<WebhookService> {
  const logger = deps_.logger.child({
    service: 'WebhookService'
  })
  const deps = { ...deps_, logger }
  return {
    getEvent: (id) => getWebhookEvent(deps, id),
    processNext: () => processNextWebhookEvent(deps)
  }
}

async function getWebhookEvent(
  deps: ServiceDependencies,
  id: string
): Promise<WebhookEvent | undefined> {
  return WebhookEvent.query(deps.knex).findById(id)
}

// Fetch (and lock) a webhook event for work.
// Returns the id of the processed event (if any).
async function processNextWebhookEvent(
  deps_: ServiceDependencies
): Promise<string | undefined> {
  assert.ok(deps_.knex, 'Knex undefined')
  return deps_.knex.transaction(async (trx) => {
    const now = Date.now()
    const events = await WebhookEvent.query(trx)
      .limit(1)
      // Ensure the webhook event cannot be processed concurrently by multiple workers.
      .forUpdate()
      // If a webhook event is locked, don't wait — just come back for it later.
      .skipLocked()
      .where('processAt', '<=', new Date(now).toISOString())

    const event = events[0]
    if (!event) return

    const deps = {
      ...deps_,
      knex: trx,
      logger: deps_.logger.child({
        event: event.id
      })
    }

    if (now >= event.createdAt.getTime() + RETENTION_LIMIT_MS) {
      await event.$query(deps.knex).delete()
    } else {
      await sendWebhookEvent(deps, event)
    }

    return event.id
  })
}

async function sendWebhookEvent(
  deps: ServiceDependencies,
  event: WebhookEvent
): Promise<void> {
  try {
    const requestHeaders = {
      'Content-Type': 'application/json'
    }

    if (deps.config.webhookSecret) {
      requestHeaders['Rafiki-Signature'] = generateWebhookSignature(
        event,
        deps.config.webhookSecret,
        deps.config.signatureVersion
      )
    }

    const body = {
      id: event.id,
      type: event.type,
      data: event.data
    }

    await axios.post(deps.config.webhookUrl, body, {
      timeout: deps.config.webhookTimeout,
      headers: requestHeaders,
      validateStatus: (status) => status === 200
    })

    await event.$query(deps.knex).patch({
      attempts: event.attempts + 1,
      statusCode: 200,
      processAt: new Date(event.createdAt.getTime() + RETENTION_LIMIT_MS)
    })
  } catch (err) {
    const attempts = event.attempts + 1
    const error = err.message
    deps.logger.warn(
      {
        attempts,
        error
      },
      'webhook request failed'
    )

    const retryAt = Date.now() + Math.min(attempts, 6) * RETRY_BACKOFF_MS
    const processAt =
      retryAt < event.createdAt.getTime() + RETRY_LIMIT_MS
        ? new Date(retryAt)
        : new Date(event.createdAt.getTime() + RETENTION_LIMIT_MS)

    await event.$query(deps.knex).patch({
      attempts,
      statusCode: err.isAxiosError && err.response?.status,
      processAt
    })
  }
}

export function generateWebhookSignature(
  event: WebhookEvent,
  secret: string,
  version: number
): string {
  const timestamp = Math.round(new Date().getTime() / 1000)

  const payload = `${timestamp}.${event}`
  const hmac = createHmac('sha256', secret)
  hmac.update(payload)
  const digest = hmac.digest('hex')

  return `t=${timestamp}, v${version}=${digest}`
}
