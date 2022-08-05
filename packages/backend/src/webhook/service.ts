import axios from 'axios'
import { createHmac } from 'crypto'
import { ForeignKeyViolationError, Transaction } from 'objection'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const canonicalJson = require('canonical-json')

import { WebhookEventError } from './errors'
import { WebhookEvent } from './model'
import { IAppConfig } from '../config/app'
import { Pagination } from '../shared/baseModel'
import { BaseService } from '../shared/baseService'

export interface WebhookService {
  createEvent(
    opts: EventOptions,
    trx?: Transaction
  ): Promise<WebhookEvent | WebhookEventError>
  getEvent(id: string): Promise<WebhookEvent | undefined>
  getPage(pagination?: Pagination): Promise<WebhookEvent[]>
}

interface ServiceDependencies extends BaseService {
  config: IAppConfig
}

export type EventOptions = Pick<WebhookEvent, 'type' | 'data' | 'withdrawal'>

export async function createWebhookService(
  deps_: ServiceDependencies
): Promise<WebhookService> {
  const logger = deps_.logger.child({
    service: 'WebhookService'
  })
  const deps = { ...deps_, logger }
  return {
    createEvent: (opts, trx) => createWebhookEvent(deps, opts, trx),
    getEvent: (id) => getWebhookEvent(deps, id),
    getPage: (pagination?) => getEventsPage(deps, pagination)
  }
}

async function createWebhookEvent(
  deps: ServiceDependencies,
  opts: EventOptions,
  trx?: Transaction
): Promise<WebhookEvent | WebhookEventError> {
  try {
    const event = await WebhookEvent.query(trx || deps.knex).insert(opts)
    sendWebhookEvent(deps, event)
    return event
  } catch (err) {
    if (err instanceof ForeignKeyViolationError) {
      if (err.constraint === 'webhookevents_withdrawalassetid_foreign') {
        return WebhookEventError.InvalidWithdrawalAsset
      }
    }
    throw err
  }
}

async function getWebhookEvent(
  deps: ServiceDependencies,
  id: string
): Promise<WebhookEvent | undefined> {
  return WebhookEvent.query(deps.knex).findById(id)
}

async function sendWebhookEvent(
  deps: ServiceDependencies,
  event: WebhookEvent
): Promise<void> {
  try {
    const requestHeaders = {
      'Content-Type': 'application/json'
    }

    const body = {
      id: event.id,
      type: event.type,
      data: event.data
    }

    if (deps.config.signatureSecret) {
      requestHeaders['Rafiki-Signature'] = generateWebhookSignature(
        body,
        deps.config.signatureSecret,
        deps.config.signatureVersion
      )
    }

    await axios.post(deps.config.webhookUrl, body, {
      timeout: deps.config.webhookTimeout,
      headers: requestHeaders,
      validateStatus: (status) => status === 200
    })
  } catch (err) {
    const error = err.message
    deps.logger.warn(
      {
        error,
        statusCode: err.isAxiosError && err.response?.status
      },
      'webhook request failed'
    )
  }
}

export type EventPayload = Pick<WebhookEvent, 'id' | 'type' | 'data'>

export function generateWebhookSignature(
  event: EventPayload,
  secret: string,
  version: number
): string {
  const timestamp = Math.round(new Date().getTime() / 1000)

  const payload = `${timestamp}.${canonicalJson({
    id: event.id,
    type: event.type,
    data: event.data
  })}`
  const hmac = createHmac('sha256', secret)
  hmac.update(payload)
  const digest = hmac.digest('hex')

  return `t=${timestamp}, v${version}=${digest}`
}

async function getEventsPage(
  deps: ServiceDependencies,
  pagination?: Pagination
): Promise<WebhookEvent[]> {
  return await WebhookEvent.query(deps.knex).getPage(pagination)
}
