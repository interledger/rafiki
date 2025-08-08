import axios, { isAxiosError } from 'axios'
import { createHmac } from 'crypto'
import { canonicalize } from 'json-canonicalize'

import { isWebhookWithEvent, Webhook, WebhookWithEvent } from './model'
import { WebhookEvent } from './event/model'
import { IAppConfig } from '../config/app'
import { BaseService } from '../shared/baseService'
import { Pagination, SortOrder } from '../shared/baseModel'
import { FilterString } from '../shared/filters'
import { trace, Span } from '@opentelemetry/api'
import {
  formatSettings,
  FormattedTenantSettings,
  TenantSettingKeys
} from '../tenants/settings/model'
import { TenantSettingService } from '../tenants/settings/service'

// First retry waits 10 seconds
// Second retry waits 20 (more) seconds
// Third retry waits 30 (more) seconds, etc. up to 60 seconds
export const RETRY_BACKOFF_MS = 10_000

interface WebhookEventFilter {
  type?: FilterString
}

interface GetPageOptions {
  pagination?: Pagination
  filter?: WebhookEventFilter
  sortOrder?: SortOrder
  tenantId?: string
}

export interface WebhookService {
  getEvent(id: string, tenantId?: string): Promise<WebhookEvent | undefined>
  getLatestByResourceId(
    options: WebhookByResourceIdOptions
  ): Promise<WebhookEvent | undefined>
  processNext(): Promise<string | undefined>
  getPage(options?: GetPageOptions): Promise<WebhookEvent[]>
}

interface ServiceDependencies extends BaseService {
  config: IAppConfig
  tenantSettingService: TenantSettingService
}

export async function createWebhookService(
  deps_: ServiceDependencies
): Promise<WebhookService> {
  const logger = deps_.logger.child({
    service: 'WebhookService'
  })
  const deps = { ...deps_, logger }
  return {
    getEvent: (id, tenantId) => getWebhookEvent(deps, id, tenantId),
    getLatestByResourceId: (options) =>
      getLatestWebhookEventByResourceId(deps, options),
    processNext: () => processNextWebhook(deps),
    getPage: (options) => getWebhookEventsPage(deps, options)
  }
}

async function getWebhookEvent(
  deps: ServiceDependencies,
  id: string,
  tenantId?: string
): Promise<WebhookEvent | undefined> {
  const query = WebhookEvent.query(deps.knex)
  if (tenantId) query.where('tenantId', tenantId)
  return query.findById(id)
}

interface WebhookEventOptions {
  types?: string[]
}
interface OutgoingPaymentOptions extends WebhookEventOptions {
  outgoingPaymentId: string
}
interface IncomingPaymentOptions extends WebhookEventOptions {
  incomingPaymentId: string
}
interface WalletAddressOptions extends WebhookEventOptions {
  walletAddressId: string
}
interface PeerOptions extends WebhookEventOptions {
  peerId: string
}
interface AssetOptions extends WebhookEventOptions {
  assetId: string
}
type WebhookByResourceIdOptions =
  | OutgoingPaymentOptions
  | IncomingPaymentOptions
  | WalletAddressOptions
  | PeerOptions
  | AssetOptions

async function getLatestWebhookEventByResourceId(
  deps: ServiceDependencies,
  options: WebhookByResourceIdOptions
): Promise<WebhookEvent | undefined> {
  const { types } = options

  const query = WebhookEvent.query(deps.knex)
    .orderBy('createdAt', 'DESC')
    .limit(1)

  if (types && types.length) {
    query.whereIn('type', types)
  }

  if ('outgoingPaymentId' in options) {
    query.where({ outgoingPaymentId: options.outgoingPaymentId })
  } else if ('incomingPaymentId' in options) {
    query.where({ incomingPaymentId: options.incomingPaymentId })
  } else if ('walletAddressId' in options) {
    query.where({ incomingPaymentId: options.walletAddressId })
  } else if ('peerId' in options) {
    query.where({ incomingPaymentId: options.peerId })
  } else {
    query.where({ assetId: options.assetId })
  }

  return await query.first()
}

// Fetch (and lock) a webhook for work.
// Returns the id of the processed webhook (if any).
async function processNextWebhook(
  deps_: ServiceDependencies
): Promise<string | undefined> {
  if (!deps_.knex) {
    throw new Error('Knex undefined')
  }

  const tracer = trace.getTracer('webhook_worker')

  return tracer.startActiveSpan('processNextWebhook', async (span: Span) => {
    return deps_.knex!.transaction(async (trx) => {
      const now = Date.now()
      const webhooks = await Webhook.query(trx)
        .limit(1)
        // Ensure the webhook cannot be processed concurrently by multiple workers.
        .forUpdate()
        // If a webhook is locked, don't wait — just come back for it later.
        .skipLocked()
        .whereRaw(
          `attempts < GREATEST(coalesce((select value from "tenantSettings" where "tenantId" = "webhooks"."recipientTenantId" and key = '${TenantSettingKeys.WEBHOOK_MAX_RETRY.name}')::integer, ${deps_.config.webhookMaxRetry}))`
        )
        .where('processAt', '<=', new Date(now).toISOString())
        .withGraphFetched('event')

      const webhook = webhooks[0]
      if (!webhook || !isWebhookWithEvent(webhook)) return

      const deps = {
        ...deps_,
        knex: trx,
        logger: deps_.logger.child({
          event: webhook.eventId,
          webhook: webhook.id
        })
      }

      const settings = await deps_.tenantSettingService.get({
        tenantId: webhook.recipientTenantId
      })
      const formattedSettings = formatSettings(settings)

      await sendWebhook(deps, webhook, formattedSettings)

      span.end()
      return webhook.id
    })
  })
}

type WebhookHeaders = {
  'Content-Type': string
  'Rafiki-Signature'?: string
}

async function sendWebhook(
  deps: ServiceDependencies,
  webhook: WebhookWithEvent,
  settings: Partial<FormattedTenantSettings>
): Promise<void> {
  try {
    const requestHeaders: WebhookHeaders = {
      'Content-Type': 'application/json'
    }

    const body = {
      id: webhook.event.id,
      type: webhook.event.type,
      data: webhook.event.data
    }

    if (deps.config.signatureSecret) {
      requestHeaders['Rafiki-Signature'] = generateWebhookSignature(
        body,
        deps.config.signatureSecret,
        deps.config.signatureVersion
      )
    }

    await axios.post(settings?.webhookUrl ?? deps.config.webhookUrl, body, {
      timeout: settings?.webhookTimeout
        ? Number(settings?.webhookTimeout)
        : deps.config.webhookTimeout,
      headers: requestHeaders,
      validateStatus: (status) => status === 200
    })

    await webhook.$query(deps.knex).patch({
      attempts: webhook.attempts + 1,
      statusCode: 200,
      processAt: null
    })
  } catch (err) {
    if (isAxiosError(err)) {
      const attempts = webhook.attempts + 1
      const errorMessage = err.message
      deps.logger.warn(
        {
          attempts,
          error: errorMessage
        },
        'webhook request failed'
      )

      await webhook.$query(deps.knex).patch({
        attempts,
        statusCode: err.response ? err.response.status : undefined,
        processAt: new Date(
          Date.now() + Math.min(attempts, 6) * RETRY_BACKOFF_MS
        )
      })
    } else {
      deps.logger.warn({ error: err }, 'error not type AxiosError')
      throw err
    }
  }
}

export type EventPayload = Pick<WebhookEvent, 'id' | 'type' | 'data'>

export function generateWebhookSignature(
  event: EventPayload,
  secret: string,
  version: number
): string {
  const timestamp = Date.now()

  const payload = `${timestamp}.${canonicalize({
    id: event.id,
    type: event.type,
    data: event.data
  })}`
  const hmac = createHmac('sha256', secret)
  hmac.update(payload)
  const digest = hmac.digest('hex')

  return `t=${timestamp}, v${version}=${digest}`
}

async function getWebhookEventsPage(
  deps: ServiceDependencies,
  options?: GetPageOptions
): Promise<WebhookEvent[]> {
  const { filter, pagination, sortOrder, tenantId } = options ?? {}

  const query = WebhookEvent.query(deps.knex)

  if (tenantId) {
    query.where('tenantId', tenantId)
  }

  if (filter?.type?.in && filter.type.in.length > 0) {
    query.whereIn('type', filter.type.in)
  }

  return await query.getPage(pagination, sortOrder)
}

export function finalizeWebhookRecipients(
  tenantIds: string[],
  config: IAppConfig
): Pick<Webhook, 'recipientTenantId'>[] {
  const tenantIdSet = new Set(tenantIds)

  if (
    !tenantIdSet.has(config.operatorTenantId) &&
    config.sendTenantWebhooksToOperator
  ) {
    tenantIdSet.add(config.operatorTenantId)
  }

  return [...tenantIdSet.values()].map((tenantId) => ({
    recipientTenantId: tenantId
  }))
}
