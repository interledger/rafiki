import { Model, ModelOptions, Pojo, QueryContext } from 'objection'

import { LiquidityAccount } from '../../../accounting/service'
import { Asset } from '../../../asset/model'
import { ConnectorAccount } from '../../../connector/core/rafiki'
import { Account } from '../../account/model'
import { Quote } from '../../quote/model'
import { Amount, AmountJSON } from '../../amount'
import { BaseModel } from '../../../shared/baseModel'
import { WebhookEvent } from '../../../webhook/model'

export class OutgoingPayment
  extends BaseModel
  implements ConnectorAccount, LiquidityAccount {
  public static readonly tableName = 'outgoingPayments'

  static get virtualAttributes(): string[] {
    return ['sendAmount', 'receiveAmount', 'quote', 'sentAmount', 'receiver']
  }

  public state!: OutgoingPaymentState
  // The "| null" is necessary so that `$beforeUpdate` can modify a patch to remove the error. If `$beforeUpdate` set `error = undefined`, the patch would ignore the modification.
  public error?: string | null
  public stateAttempts!: number

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

  // Open payments account id of the sender
  public accountId!: string
  public account?: Account

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
    account: {
      relation: Model.HasOneRelation,
      modelClass: Account,
      join: {
        from: 'outgoingPayments.accountId',
        to: 'accounts.id'
      }
    },
    quote: {
      relation: Model.HasOneRelation,
      modelClass: Quote,
      join: {
        from: 'outgoingPayments.id',
        to: 'quotes.id'
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

  public toData(): OutgoingPaymentData {
    return {
      outgoingPayment: this.toResponse()
    }
  }

  public toResponse(): OutgoingPaymentResponse {
    const payment: OutgoingPaymentResponse = {
      id: this.id,
      accountId: this.accountId,
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
        ...this.sentAmount,
        value: this.sentAmount.value.toString()
      },
      createdAt: new Date(+this.createdAt).toISOString(),
      updatedAt: new Date(+this.updatedAt).toISOString()
    }
    if (this.description) {
      payment.description = this.description
    }
    if (this.externalRef) {
      payment.externalRef = this.externalRef
    }
    if (this.error) {
      payment.error = this.error
    }
    if (this.peerId) {
      payment.peerId = this.peerId
    }
    return payment
  }

  $formatJson(json: Pojo): Pojo {
    json = super.$formatJson(json)
    return {
      id: json.id,
      accountId: json.accountId,
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

export enum OutgoingPaymentEventType {
  OutgoingPaymentCreated = 'OUTGOING_PAYMENT_CREATED',
  OutgoingPaymentFailed = 'OUTGOING_PAYMENT_FAILED',
  OutgoingPaymentCompleted = 'OUTGOING_PAYMENT_COMPLETED'
}

export interface OutgoingPaymentResponse {
  id: string
  accountId: string
  createdAt: string
  receiver: string
  sendAmount: AmountJSON
  receiveAmount: AmountJSON
  description?: string
  externalRef?: string
  error?: string
  state: OutgoingPaymentState
  updatedAt: string
  sentAmount: AmountJSON
  peerId?: string
}

export type OutgoingPaymentData = {
  outgoingPayment: OutgoingPaymentResponse
}

export const isOutgoingPaymentEventType = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  o: any
): o is OutgoingPaymentEventType =>
  Object.values(OutgoingPaymentEventType).includes(o)

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isOutgoingPaymentEvent = (o: any): o is OutgoingPaymentEvent =>
  o instanceof WebhookEvent && isOutgoingPaymentEventType(o.type)

export class OutgoingPaymentEvent extends WebhookEvent {
  public type!: OutgoingPaymentEventType
  public data!: OutgoingPaymentData
}

export type OutgoingPaymentJSON = {
  id: string
  accountId: string
  receiver: string
  sendAmount: AmountJSON
  sentAmount: AmountJSON
  receiveAmount: AmountJSON
  description: string | null
  externalRef: string | null
  createdAt: string
  updatedAt: string
}
