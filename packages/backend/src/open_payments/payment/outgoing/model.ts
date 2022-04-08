import { Model, ModelOptions, QueryContext } from 'objection'
import * as Pay from '@interledger/pay'

import { LiquidityAccount } from '../../../accounting/service'
import { Asset } from '../../../asset/model'
import { ConnectorAccount } from '../../../connector/core/rafiki'
import { Account } from '../../account/model'
import { Amount } from '../amount'
import { BaseModel } from '../../../shared/baseModel'
import { WebhookEvent } from '../../../webhook/model'

export class OutgoingPayment
  extends BaseModel
  implements ConnectorAccount, LiquidityAccount {
  public static readonly tableName = 'outgoingPayments'

  static get virtualAttributes(): string[] {
    return ['sendAmount', 'receiveAmount', 'quote']
  }

  public state!: OutgoingPaymentState
  // The "| null" is necessary so that `$beforeUpdate` can modify a patch to remove the error. If `$beforeUpdate` set `error = undefined`, the patch would ignore the modification.
  public error?: string | null
  public stateAttempts!: number

  public receivingAccount?: string
  public receivingPayment?: string

  private sendAmountValue?: bigint | null
  private sendAmountAssetCode?: string | null
  private sendAmountAssetScale?: number | null

  public get sendAmount(): Amount | null {
    if (this.sendAmountValue) {
      return {
        value: this.sendAmountValue,
        assetCode: this.asset.code,
        assetScale: this.asset.scale
      }
    }
    return null
  }

  public set sendAmount(amount: Amount | null) {
    this.sendAmountValue = amount?.value ?? null
  }

  private receiveAmountValue?: bigint | null
  private receiveAmountAssetCode?: string | null
  private receiveAmountAssetScale?: number | null

  public get receiveAmount(): Amount | null {
    if (
      this.receiveAmountValue &&
      this.receiveAmountAssetCode &&
      this.receiveAmountAssetScale
    ) {
      return {
        value: this.receiveAmountValue,
        assetCode: this.receiveAmountAssetCode,
        assetScale: this.receiveAmountAssetScale
      }
    }
    return null
  }

  public set receiveAmount(amount: Amount | null) {
    this.receiveAmountValue = amount?.value ?? null
    this.receiveAmountAssetCode = amount?.assetCode ?? null
    this.receiveAmountAssetScale = amount?.assetScale ?? null
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
      !this.quoteHighExchangeRateEstimateDenominator
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
      )
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
  }

  // Open payments account id of the sender
  public accountId!: string
  public account?: Account

  public readonly assetId!: string
  public asset!: Asset

  static relationMappings = {
    account: {
      relation: Model.HasOneRelation,
      modelClass: Account,
      join: {
        from: 'outgoingPayments.accountId',
        to: 'accounts.id'
      }
    },
    asset: {
      relation: Model.HasOneRelation,
      modelClass: Asset,
      join: {
        from: 'outgoingPayments.assetId',
        to: 'assets.id'
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
        value: this.sendAmount.value.toString(),
        assetCode: this.sendAmount.assetCode,
        assetScale: this.sendAmount.assetScale
      }
    }
    if (this.receiveAmount) {
      data.payment.receiveAmount = {
        value: this.receiveAmount.value.toString(),
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
    if (this.quote) {
      data.payment.quote = {
        ...this.quote,
        timestamp: this.quote.timestamp.toISOString(),
        maxPacketAmount: this.quote.maxPacketAmount.toString(),
        minExchangeRate: this.quote.minExchangeRate.valueOf(),
        lowExchangeRateEstimate: this.quote.lowExchangeRateEstimate.valueOf(),
        highExchangeRateEstimate: this.quote.highExchangeRateEstimate.valueOf()
      }
    }
    return data
  }
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
}

export enum OutgoingPaymentState {
  // Initial state. In this state, an empty account is generated, and the payment is automatically resolved & quoted.
  // On success, transition to `FUNDING`.
  // On failure, transition to `FAILED`.
  Pending = 'PENDING',
  // Awaiting money from the user's wallet account to be deposited to the payment account to reserve it for the payment.
  // On success, transition to `SENDING`.
  Funding = 'FUNDING',
  // Pay from the account to the destination.
  // On success, transition to `COMPLETED`.
  Sending = 'SENDING',
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
  value: string
  assetCode: string
  assetScale: number
}

export type PaymentData = {
  payment: {
    id: string
    accountId: string
    createdAt: string
    state: OutgoingPaymentState
    error?: string
    stateAttempts: number
    receivingAccount?: string
    receivingPayment?: string
    sendAmount?: AmountData
    receiveAmount?: AmountData
    description?: string
    externalRef?: string
    quote?: {
      timestamp: string
      targetType: Pay.PaymentType
      maxPacketAmount: string
      minExchangeRate: number
      lowExchangeRateEstimate: number
      highExchangeRateEstimate: number
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
