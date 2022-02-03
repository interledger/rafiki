import assert from 'assert'
import axios from 'axios'
import { createHmac } from 'crypto'
import { Transaction } from 'objection'

import {
  WebhookEvent,
  InvoiceData,
  PaymentData,
  InvoiceEventType,
  PaymentEventType
} from './model'
import { IAppConfig } from '../config/app'
import { Invoice } from '../open_payments/invoice/model'
import { OutgoingPayment } from '../outgoing_payment/model'
import { BaseService } from '../shared/baseService'

// First retry waits 10 seconds, second retry waits 20 (more) seconds, etc.
export const RETRY_BACKOFF_MS = 10_000
export const RETRY_LIMIT_MS = 60_000 * 60 * 24 // 1 day
export const RETENTION_LIMIT_MS = 60_000 * 60 * 24 * 30 // 30 days

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isPaymentEventType = (type: any): type is PaymentEventType =>
  Object.values(PaymentEventType).includes(type)

interface InvoiceEvent {
  id?: string
  type: InvoiceEventType
  invoice: Invoice
  payment?: never
  amountReceived: bigint
  amountSent?: never
  balance?: never
}

interface PaymentEvent {
  id?: string
  type: PaymentEventType
  invoice?: never
  payment: OutgoingPayment
  amountReceived?: never
  amountSent: bigint
  balance: bigint
}

export type EventOptions = InvoiceEvent | PaymentEvent

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isPaymentEvent = (event: any): event is PaymentEvent =>
  Object.values(PaymentEventType).includes(event.type)

export interface WebhookService {
  createEvent(options: EventOptions, trx?: Transaction): Promise<WebhookEvent>
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
    createEvent: (options) => createWebhookEvent(deps, options),
    getEvent: (id) => getWebhookEvent(deps, id),
    processNext: () => processNextWebhookEvent(deps)
  }
}

async function createWebhookEvent(
  deps: ServiceDependencies,
  options: EventOptions,
  trx?: Transaction
): Promise<WebhookEvent> {
  return await WebhookEvent.query(trx || deps.knex).insertAndFetch({
    id: options.id,
    type: options.type,
    data: options.invoice
      ? invoiceToData(options.invoice, options.amountReceived)
      : paymentToData(options.payment, options.amountSent, options.balance),
    processAt: new Date()
  })
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
      headers: requestHeaders
    })

    await event.$query(deps.knex).patch({
      error: null,
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
      error,
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

export function invoiceToData(
  invoice: Invoice,
  amountReceived: bigint
): InvoiceData {
  return {
    invoice: {
      id: invoice.id,
      accountId: invoice.accountId,
      active: invoice.active,
      amount: invoice.amount.toString(),
      description: invoice.description,
      expiresAt: invoice.expiresAt.toISOString(),
      createdAt: new Date(+invoice.createdAt).toISOString(),
      received: amountReceived.toString()
    }
  }
}

export function paymentToData(
  payment: OutgoingPayment,
  amountSent: bigint,
  balance: bigint
): PaymentData {
  const json: PaymentData = {
    payment: {
      id: payment.id,
      accountId: payment.accountId,
      state: payment.state,
      stateAttempts: payment.stateAttempts,
      intent: {
        autoApprove: payment.intent.autoApprove
      },
      destinationAccount: payment.destinationAccount,
      createdAt: new Date(+payment.createdAt).toISOString(),
      outcome: {
        amountSent: amountSent.toString()
      },
      balance: balance.toString()
    }
  }
  if (payment.intent.paymentPointer) {
    json.payment.intent.paymentPointer = payment.intent.paymentPointer
  }
  if (payment.intent.invoiceUrl) {
    json.payment.intent.invoiceUrl = payment.intent.invoiceUrl
  }
  if (payment.intent.amountToSend) {
    json.payment.intent.amountToSend = payment.intent.amountToSend.toString()
  }
  if (payment.error) {
    json.payment.error = payment.error
  }
  if (payment.quote) {
    json.payment.quote = {
      ...payment.quote,
      timestamp: payment.quote.timestamp.toISOString(),
      activationDeadline: payment.quote.activationDeadline.toISOString(),
      minDeliveryAmount: payment.quote.minDeliveryAmount.toString(),
      maxSourceAmount: payment.quote.maxSourceAmount.toString(),
      maxPacketAmount: payment.quote.maxPacketAmount.toString(),
      minExchangeRate: payment.quote.minExchangeRate.valueOf(),
      lowExchangeRateEstimate: payment.quote.lowExchangeRateEstimate.valueOf(),
      highExchangeRateEstimate: payment.quote.highExchangeRateEstimate.valueOf(),
      amountSent: payment.quote.amountSent.toString()
    }
  }
  return json
}
