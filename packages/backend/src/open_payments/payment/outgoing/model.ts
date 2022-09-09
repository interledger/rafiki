import { Model, ModelOptions, Pojo, QueryContext } from 'objection'

import { LiquidityAccount } from '../../../accounting/service'
import { Asset } from '../../../asset/model'
import { ConnectorAccount } from '../../../connector/core/rafiki'
import { PaymentPointer } from '../../payment_pointer/model'
import { Quote } from '../../quote/model'
import { Amount, AmountJSON } from '../../amount'
import { BaseModel } from '../../../shared/baseModel'
import { WebhookEvent } from '../../../webhook/model'
import { Grant } from '../../auth/grantModel'

export class OutgoingPayment
  extends BaseModel
  implements ConnectorAccount, LiquidityAccount
{
  public static readonly tableName = 'outgoingPayments'

  static get virtualAttributes(): string[] {
    return ['sendAmount', 'receiveAmount', 'quote', 'sentAmount', 'receiver']
  }

  public state!: OutgoingPaymentState
  // The "| null" is necessary so that `$beforeUpdate` can modify a patch to remove the error. If `$beforeUpdate` set `error = undefined`, the patch would ignore the modification.
  public error?: string | null
  public stateAttempts!: number

  public grantId!: string
  public grant!: Grant

  public get receiver(): string {
    return this.quote.receiver
  }

  public get sendAmount(): Amount {
    return this.quote.sendAmount
  }

  private sentAmountValue?: bigint

  public get sentAmount(): Amount {
    return {
      value: this.sentAmountValue || BigInt(0),
      assetCode: this.asset.code,
      assetScale: this.asset.scale
    }
  }
  public set sentAmount(amount: Amount) {
    this.sentAmountValue = amount.value
  }
  public get receiveAmount(): Amount {
    return this.quote.receiveAmount
  }

  public description?: string
  public externalRef?: string

  // Open payments payment pointer id of the sender
  public paymentPointerId!: string
  public paymentPointer?: PaymentPointer

  public quote!: Quote

  public get assetId(): string {
    return this.quote.assetId
  }

  public get asset(): Asset {
    return this.quote.asset
  }

  // Outgoing peer
  public peerId?: string

  static relationMappings = {
    paymentPointer: {
      relation: Model.BelongsToOneRelation,
      modelClass: PaymentPointer,
      join: {
        from: 'outgoingPayments.paymentPointerId',
        to: 'paymentPointers.id'
      }
    },
    quote: {
      relation: Model.HasOneRelation,
      modelClass: Quote,
      join: {
        from: 'outgoingPayments.id',
        to: 'quotes.id'
      }
    },
    grant: {
      relation: Model.HasOneRelation,
      modelClass: Grant,
      join: {
        from: 'outgoingPayments.grantId',
        to: 'grants.id'
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
        paymentPointerId: this.paymentPointerId,
        state: this.state,
        receiver: this.receiver,
        sendAmount: {
          ...this.sendAmount,
          value: this.sendAmount.value.toString()
        },
        receiveAmount: {
          ...this.receiveAmount,
          value: this.receiveAmount.value.toString()
        },
        sentAmount: {
          ...this.sendAmount,
          value: amountSent.toString()
        },
        stateAttempts: this.stateAttempts,
        createdAt: new Date(+this.createdAt).toISOString(),
        updatedAt: new Date(+this.updatedAt).toISOString(),
        balance: balance.toString()
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
    if (this.peerId) {
      data.payment.peerId = this.peerId
    }
    return data
  }

  $formatJson(json: Pojo): Pojo {
    json = super.$formatJson(json)
    return {
      id: json.id,
      state: json.state,
      receiver: json.receiver,
      sendAmount: {
        ...json.sendAmount,
        value: json.sendAmount.value.toString()
      },
      sentAmount: {
        ...json.sentAmount,
        value: json.sentAmount.value.toString()
      },
      receiveAmount: {
        ...json.receiveAmount,
        value: json.receiveAmount.value.toString()
      },
      description: json.description,
      externalRef: json.externalRef,
      createdAt: json.createdAt,
      updatedAt: json.updatedAt
    }
  }
}

export enum OutgoingPaymentState {
  // Initial state.
  // Awaiting money from the user's wallet account to be deposited to the payment account to reserve it for the payment.
  // On success, transition to `SENDING`.
  // On failure, transition to `FAILED`.
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
  PaymentCreated = 'outgoing_payment.created'
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

export interface OutgoingPaymentResponse {
  id: string
  paymentPointerId: string
  createdAt: string
  receiver: string
  sendAmount: AmountJSON
  receiveAmount: AmountJSON
  description?: string
  externalRef?: string
  failed: boolean
  updatedAt: string
  sentAmount: AmountJSON
}

export type PaymentData = {
  payment: Omit<OutgoingPaymentResponse, 'failed'> & {
    error?: string
    state: OutgoingPaymentState
    stateAttempts: number
    balance: string
    peerId?: string
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

export type OutgoingPaymentJSON = {
  id: string
  paymentPointer: string
  receiver: string
  sendAmount: AmountJSON
  sentAmount: AmountJSON
  receiveAmount: AmountJSON
  description: string | null
  externalRef: string | null
  createdAt: string
  updatedAt: string
}
