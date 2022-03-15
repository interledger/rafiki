import { Model, ModelOptions, QueryContext } from 'objection'
import * as Pay from '@interledger/pay'

import { LiquidityAccount } from '../../../accounting/service'
import { Asset } from '../../../asset/model'
import { ConnectorAccount } from '../../../connector/core/rafiki'
import { Account } from '../../account/model'
import { BaseModel } from '../../../shared/baseModel'
import { WebhookEvent } from '../../../webhook/model'

export class OutgoingPayment
  extends BaseModel
  implements ConnectorAccount, LiquidityAccount {
  public static readonly tableName = 'outgoingPayments'

  static get virtualAttributes(): string[] {
    return ['sendAmount', 'receiveAmount', 'quote']
  }

  public state!: PaymentState
  public authorized!: boolean
  // The "| null" is necessary so that `$beforeUpdate` can modify a patch to remove the error. If `$beforeUpdate` set `error = undefined`, the patch would ignore the modification.
  public error?: string | null
  public stateAttempts!: number
  public expiresAt?: Date | null

  public receivingAccount?: string
  public receivingPayment?: string

  private sendAmountAmount?: bigint | null
  private sendAmountAssetCode?: string | null
  private sendAmountAssetScale?: number | null

  public get sendAmount(): PaymentAmount | null {
    if (this.sendAmountAmount) {
      return {
        amount: this.sendAmountAmount,
        assetCode: this.sendAmountAssetCode ?? undefined,
        assetScale: this.sendAmountAssetScale ?? undefined
      }
    }
    return null
  }

  public set sendAmount(value: PaymentAmount | null) {
    this.sendAmountAmount = value?.amount ?? null
    this.sendAmountAssetCode = value?.assetCode ?? null
    this.sendAmountAssetScale = value?.assetScale ?? null
  }

  private receiveAmountAmount?: bigint | null
  private receiveAmountAssetCode?: string | null
  private receiveAmountAssetScale?: number | null

  public get receiveAmount(): PaymentAmount | null {
    if (this.receiveAmountAmount) {
      return {
        amount: this.receiveAmountAmount,
        assetCode: this.receiveAmountAssetCode ?? undefined,
        assetScale: this.receiveAmountAssetScale ?? undefined
      }
    }
    return null
  }

  public set receiveAmount(value: PaymentAmount | null) {
    this.receiveAmountAmount = value?.amount ?? null
    this.receiveAmountAssetCode = value?.assetCode ?? null
    this.receiveAmountAssetScale = value?.assetScale ?? null
  }

  public description?: string
  public externalRef?: string

  private quoteTimestamp?: Date | null
  private quoteTargetType?: Pay.PaymentType | null
  private quoteMaxPacketAmount?: bigint | null
  private quoteMinExchangeRateNumerator?: bigint | null
  private quoteMinExchangeRateDenominator?: bigint | null
  private quoteLowExchangeRateEstimateNumerator?: bigint | null
  private quoteLowExchangeRateEstimateDenominator?: bigint | null
  private quoteHighExchangeRateEstimateNumerator?: bigint | null
  private quoteHighExchangeRateEstimateDenominator?: bigint | null
  private quoteAmountSent?: bigint | null

  public get quote(): PaymentQuote | null {
    if (
      !this.quoteTimestamp ||
      !this.quoteTargetType ||
      !this.quoteMaxPacketAmount ||
      !this.quoteMinExchangeRateNumerator ||
      !this.quoteMinExchangeRateDenominator ||
      !this.quoteLowExchangeRateEstimateNumerator ||
      !this.quoteLowExchangeRateEstimateDenominator ||
      !this.quoteHighExchangeRateEstimateNumerator ||
      !this.quoteHighExchangeRateEstimateDenominator ||
      this.quoteAmountSent == null
    )
      return null

    return {
      timestamp: this.quoteTimestamp,
      targetType: this.quoteTargetType,
      maxPacketAmount: this.quoteMaxPacketAmount,
      minExchangeRate: Pay.Ratio.of(
        Pay.Int.from(this.quoteMinExchangeRateNumerator) as Pay.PositiveInt,
        Pay.Int.from(this.quoteMinExchangeRateDenominator) as Pay.PositiveInt
      ),
      lowExchangeRateEstimate: Pay.Ratio.of(
        Pay.Int.from(
          this.quoteLowExchangeRateEstimateNumerator
        ) as Pay.PositiveInt,
        Pay.Int.from(
          this.quoteLowExchangeRateEstimateDenominator
        ) as Pay.PositiveInt
      ),
      highExchangeRateEstimate: Pay.Ratio.of(
        Pay.Int.from(
          this.quoteHighExchangeRateEstimateNumerator
        ) as Pay.PositiveInt,
        Pay.Int.from(
          this.quoteHighExchangeRateEstimateDenominator
        ) as Pay.PositiveInt
      ),
      amountSent: this.quoteAmountSent
    }
  }

  public set quote(value: PaymentQuote | null) {
    this.quoteTimestamp = value?.timestamp ?? null
    this.quoteTargetType = value?.targetType ?? null
    this.quoteMaxPacketAmount = value?.maxPacketAmount ?? null
    this.quoteMinExchangeRateNumerator = value?.minExchangeRate.a.value ?? null
    this.quoteMinExchangeRateDenominator =
      value?.minExchangeRate.b.value ?? null
    this.quoteLowExchangeRateEstimateNumerator =
      value?.lowExchangeRateEstimate.a.value ?? null
    this.quoteLowExchangeRateEstimateDenominator =
      value?.lowExchangeRateEstimate.b.value ?? null
    this.quoteHighExchangeRateEstimateNumerator =
      value?.highExchangeRateEstimate.a.value ?? null
    this.quoteHighExchangeRateEstimateDenominator =
      value?.highExchangeRateEstimate.b.value ?? null
    this.quoteAmountSent = value?.amountSent ?? null
  }

  // Open payments account id of the sender
  public accountId!: string
  public account!: Account

  public get asset(): Asset {
    return this.account.asset
  }

  static relationMappings = {
    account: {
      relation: Model.HasOneRelation,
      modelClass: Account,
      join: {
        from: 'outgoingPayments.accountId',
        to: 'accounts.id'
      }
    }
  }

  $beforeUpdate(opts: ModelOptions, queryContext: QueryContext): void {
    super.$beforeUpdate(opts, queryContext)
    if (opts.old && this.state) {
      if (!this.stateAttempts) {
        this.stateAttempts = 0
      }
    }
  }

  public toData({
    amountSent,
    balance
  }: {
    amountSent: bigint
    balance: bigint
  }): PaymentData {
    const data: PaymentData = {
      payment: {
        id: this.id,
        accountId: this.accountId,
        state: this.state,
        authorized: this.authorized,
        stateAttempts: this.stateAttempts,
        createdAt: new Date(+this.createdAt).toISOString(),
        outcome: {
          amountSent: amountSent.toString()
        },
        balance: balance.toString()
      }
    }
    if (this.receivingAccount) {
      data.payment.receivingAccount = this.receivingAccount
    }
    if (this.receivingPayment) {
      data.payment.receivingPayment = this.receivingPayment
    }
    if (this.sendAmount) {
      data.payment.sendAmount = {
        amount: this.sendAmount.amount.toString(),
        assetCode: this.sendAmount.assetCode,
        assetScale: this.sendAmount.assetScale
      }
    }
    if (this.receiveAmount) {
      data.payment.receiveAmount = {
        amount: this.receiveAmount.amount.toString(),
        assetCode: this.receiveAmount.assetCode,
        assetScale: this.receiveAmount.assetScale
      }
    }
    if (this.description) {
      data.payment.description = this.description
    }
    if (this.externalRef) {
      data.payment.externalRef = this.externalRef
    }
    if (this.error) {
      data.payment.error = this.error
    }
    if (this.expiresAt) {
      data.payment.expiresAt = this.expiresAt.toISOString()
    }
    if (this.quote) {
      data.payment.quote = {
        ...this.quote,
        timestamp: this.quote.timestamp.toISOString(),
        maxPacketAmount: this.quote.maxPacketAmount.toString(),
        minExchangeRate: this.quote.minExchangeRate.valueOf(),
        lowExchangeRateEstimate: this.quote.lowExchangeRateEstimate.valueOf(),
        highExchangeRateEstimate: this.quote.highExchangeRateEstimate.valueOf(),
        amountSent: this.quote.amountSent.toString()
      }
    }
    return data
  }
}

export interface PaymentAmount {
  amount: bigint
  assetCode?: string
  assetScale?: number
}

interface PaymentQuote {
  timestamp: Date
  targetType: Pay.PaymentType
  maxPacketAmount: bigint
  minExchangeRate: Pay.Ratio
  lowExchangeRateEstimate: Pay.Ratio
  // Note that the upper exchange rate bound is *exclusive*.
  // (Pay.PositiveRatio, but validated later)
  highExchangeRateEstimate: Pay.Ratio
  // Amount already sent at the time of the quote
  amountSent: bigint
}

export enum PaymentState {
  // Initial state. In this state, an empty account is generated, and the payment is automatically resolved & quoted.
  // On success, transition to `PREPARED` or `FUNDING` if already authorized.
  // On failure, transition to `FAILED`.
  Pending = 'PENDING',
  // Awaiting authorization.
  // On authorization, transition to `FUNDING`.
  // On quote expiration, transition to `EXPIRED`.
  Prepared = 'PREPARED',
  // Awaiting money from the user's wallet account to be deposited to the payment account to reserve it for the payment.
  // On success, transition to `SENDING`.
  Funding = 'FUNDING',
  // Pay from the account to the destination.
  // On success, transition to `COMPLETED`.
  Sending = 'SENDING',
  // The payment quote expired.
  // Requoting transitions to `PENDING`.
  Expired = 'EXPIRED',
  // The payment failed. (Though some money may have been delivered).
  Failed = 'FAILED',
  // Successful completion.
  Completed = 'COMPLETED'
}

export enum PaymentDepositType {
  PaymentFunding = 'outgoing_payment.funding'
}

export enum PaymentWithdrawType {
  PaymentFailed = 'outgoing_payment.failed',
  PaymentCompleted = 'outgoing_payment.completed'
}

export const PaymentEventType = {
  ...PaymentDepositType,
  ...PaymentWithdrawType
}
export type PaymentEventType = PaymentDepositType | PaymentWithdrawType

interface AmountData {
  amount: string
  assetCode?: string
  assetScale?: number
}

export type PaymentData = {
  payment: {
    id: string
    accountId: string
    createdAt: string
    state: PaymentState
    authorized: boolean
    error?: string
    stateAttempts: number
    receivingAccount?: string
    receivingPayment?: string
    sendAmount?: AmountData
    receiveAmount?: AmountData
    description?: string
    externalRef?: string
    expiresAt?: string
    quote?: {
      timestamp: string
      targetType: Pay.PaymentType
      maxPacketAmount: string
      minExchangeRate: number
      lowExchangeRateEstimate: number
      highExchangeRateEstimate: number
      amountSent: string
    }
    outcome: {
      amountSent: string
    }
    balance: string
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isPaymentEventType = (o: any): o is PaymentEventType =>
  Object.values(PaymentEventType).includes(o)

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isPaymentEvent = (o: any): o is PaymentEvent =>
  o instanceof WebhookEvent && isPaymentEventType(o.type)

export class PaymentEvent extends WebhookEvent {
  public type!: PaymentEventType
  public data!: PaymentData
}
