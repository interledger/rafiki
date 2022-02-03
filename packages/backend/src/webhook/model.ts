import { PaymentType } from '@interledger/pay'

import { PaymentState } from '../outgoing_payment/model'
import { BaseModel } from '../shared/baseModel'

export enum InvoiceEventType {
  InvoiceExpired = 'invoice.expired',
  InvoicePaid = 'invoice.paid'
}

enum PaymentDepositType {
  PaymentFunding = 'outgoing_payment.funding'
}

enum PaymentWithdrawType {
  PaymentCancelled = 'outgoing_payment.cancelled',
  PaymentCompleted = 'outgoing_payment.completed'
}

export const PaymentEventType = {
  ...PaymentDepositType,
  ...PaymentWithdrawType
}
export type PaymentEventType = PaymentDepositType | PaymentWithdrawType

export const EventType = { ...InvoiceEventType, ...PaymentEventType }
export type EventType = InvoiceEventType | PaymentEventType

export const DepositEventType = PaymentDepositType
export type DepositEventType = PaymentDepositType

export const WithdrawEventType = { ...InvoiceEventType, ...PaymentWithdrawType }
export type WithdrawEventType = InvoiceEventType | PaymentWithdrawType

export interface InvoiceData {
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

export interface PaymentData {
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
      amountSent: string
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

export class WebhookEvent extends BaseModel {
  public static get tableName(): string {
    return 'webhookEvents'
  }

  public type!: EventType
  public data!: InvoiceData | PaymentData
  public attempts!: number
  public error?: string | null
  public processAt!: Date
}
