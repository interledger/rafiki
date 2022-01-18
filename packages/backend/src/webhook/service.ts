import { createHmac } from 'crypto'
import axios, { AxiosResponse } from 'axios'
import { PaymentType } from '@interledger/pay'
import { Logger } from 'pino'

import { IAppConfig } from '../config/app'
import { Invoice } from '../open_payments/invoice/model'
import { OutgoingPayment, PaymentState } from '../outgoing_payment/model'

enum InvoiceEventType {
  InvoiceExpired = 'invoice.expired',
  InvoicePaid = 'invoice.paid'
}

enum PaymentEventType {
  PaymentFunding = 'outgoing_payment.funding',
  PaymentCancelled = 'outgoing_payment.cancelled',
  PaymentCompleted = 'outgoing_payment.completed'
}

export const EventType = { ...InvoiceEventType, ...PaymentEventType }
export type EventType = InvoiceEventType | PaymentEventType

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isPaymentEventType = (type: any): type is PaymentEventType =>
  Object.values(PaymentEventType).includes(type)

interface InvoiceEvent {
  id: string
  type: InvoiceEventType
  invoice: Invoice
  payment?: never
  amountReceived: bigint
  amountSent?: never
  balance?: never
}

interface PaymentEvent {
  id: string
  type: PaymentEventType
  invoice?: never
  payment: OutgoingPayment
  amountReceived?: never
  amountSent: bigint
  balance: bigint
}

export type EventOptions = InvoiceEvent | PaymentEvent

interface InvoiceData {
  invoice: {
    id: string
    accountId: string
    active: boolean
    description?: string
    createdAt: string
    expiresAt: string
    amount: string
    received: string
  }
  payment?: never
}

interface PaymentData {
  invoice?: never
  payment: {
    id: string
    accountId: string
    createdAt: string
    state: PaymentState
    error?: string
    stateAttempts: number
    intent: {
      paymentPointer?: string
      invoiceUrl?: string
      amountToSend?: string
      autoApprove: boolean
    }

    quote?: {
      timestamp: string
      activationDeadline: string
      targetType: PaymentType
      minDeliveryAmount: string
      maxSourceAmount: string
      maxPacketAmount: string
      minExchangeRate: number
      lowExchangeRateEstimate: number
      highExchangeRateEstimate: number
    }
    destinationAccount: {
      scale: number
      code: string
      url?: string
    }
    outcome: {
      amountSent: string
    }
    balance: string
  }
}

interface WebhookEvent {
  id: string
  type: EventType
  data: InvoiceData | PaymentData
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isPaymentEvent = (event: any): event is PaymentEvent =>
  Object.values(PaymentEventType).includes(event.type)

export interface WebhookService {
  send(options: EventOptions): Promise<AxiosResponse>
  readonly timeout: number
}

interface ServiceDependencies {
  config: IAppConfig
  logger: Logger
}

export async function createWebhookService(
  deps_: ServiceDependencies
): Promise<WebhookService> {
  const logger = deps_.logger.child({
    service: 'WebhookService'
  })
  const deps = { ...deps_, logger }
  return {
    send: (options) => sendWebhook(deps, options),
    timeout: deps.config.webhookTimeout
  }
}

async function sendWebhook(
  deps: ServiceDependencies,
  options: EventOptions
): Promise<AxiosResponse> {
  const event = {
    id: options.id,
    type: options.type,
    data: isPaymentEvent(options)
      ? paymentToData(options.payment, options.amountSent, options.balance)
      : invoiceToData(options.invoice, options.amountReceived)
  }

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

  return await axios.post(deps.config.webhookUrl, event, {
    timeout: deps.config.webhookTimeout,
    headers: requestHeaders
  })
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
  return {
    payment: {
      id: payment.id,
      accountId: payment.accountId,
      state: payment.state,
      error: payment.error || undefined,
      stateAttempts: payment.stateAttempts,
      intent: {
        ...payment.intent,
        amountToSend: payment.intent.amountToSend?.toString()
      },
      quote: payment.quote && {
        ...payment.quote,
        timestamp: payment.quote.timestamp.toISOString(),
        activationDeadline: payment.quote.activationDeadline.toISOString(),
        minDeliveryAmount: payment.quote.minDeliveryAmount.toString(),
        maxSourceAmount: payment.quote.maxSourceAmount.toString(),
        maxPacketAmount: payment.quote.maxPacketAmount.toString(),
        minExchangeRate: payment.quote.minExchangeRate.valueOf(),
        lowExchangeRateEstimate: payment.quote.lowExchangeRateEstimate.valueOf(),
        highExchangeRateEstimate: payment.quote.highExchangeRateEstimate.valueOf()
      },
      destinationAccount: payment.destinationAccount,
      createdAt: new Date(+payment.createdAt).toISOString(),
      outcome: {
        amountSent: amountSent.toString()
      },
      balance: balance.toString()
    }
  }
}
