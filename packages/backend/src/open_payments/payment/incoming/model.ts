import { Model, Pojo } from 'objection'
import { Amount, AmountJSON } from '../../amount'
import { Asset } from '../../../asset/model'
import { LiquidityAccount, OnCreditOptions } from '../../../accounting/service'
import { ConnectorAccount } from '../../../connector/core/rafiki'
import { BaseModel } from '../../../shared/baseModel'
import { WebhookEvent } from '../../../webhook/model'

export enum IncomingPaymentEventType {
  IncomingPaymentExpired = 'INCOMING_PAYMENT_EXPIRED',
  IncomingPaymentCompleted = 'INCOMING_PAYMENT_COMPLETED'
}

export const isIncomingPaymentEventType = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  o: any
): o is IncomingPaymentEventType =>
  Object.values(IncomingPaymentEventType).includes(o)

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isIncomingPaymentEvent = (o: any): o is IncomingPaymentEvent =>
  o instanceof WebhookEvent && isIncomingPaymentEventType(o.type)

export enum IncomingPaymentState {
  // The payment has a state of `PENDING` when it is initially created.
  Pending = 'PENDING',
  // As soon as payment has started (funds have cleared into the account) the state moves to `PROCESSING`.
  Processing = 'PROCESSING',
  // The payment is either auto-completed once the received amount equals the expected `incomingAmount`,
  // or it is completed manually via an API call.
  Completed = 'COMPLETED',
  // If the payment expires before it is completed then the state will move to `EXPIRED`
  // and no further payments will be accepted.
  Expired = 'EXPIRED'
}

export interface IncomingPaymentResponse {
  id: string
  accountId: string
  description?: string
  createdAt: string
  updatedAt: string
  expiresAt: string
  incomingAmount?: AmountJSON
  receivedAmount: AmountJSON
  externalRef?: string
  completed: boolean
  ilpAddress?: string
  sharedSecret?: string
}

export type IncomingPaymentData = {
  incomingPayment: IncomingPaymentResponse
}

export class IncomingPaymentEvent extends WebhookEvent {
  public type!: IncomingPaymentEventType
  public data!: IncomingPaymentData
}

export class IncomingPayment
  extends BaseModel
  implements ConnectorAccount, LiquidityAccount {
  public static get tableName(): string {
    return 'incomingPayments'
  }

  static get virtualAttributes(): string[] {
    return ['incomingAmount', 'receivedAmount']
  }

  static relationMappings = {
    asset: {
      relation: Model.HasOneRelation,
      modelClass: Asset,
      join: {
        from: 'incomingPayments.assetId',
        to: 'assets.id'
      }
    }
  }

  // Open payments account id this incoming payment is for
  public accountId!: string
  public description?: string
  public expiresAt!: Date
  public state!: IncomingPaymentState
  public externalRef?: string
  public connectionId!: string

  public processAt!: Date | null

  public readonly assetId!: string
  public asset!: Asset

  private incomingAmountValue?: bigint | null
  private receivedAmountValue?: bigint

  public get incomingAmount(): Amount | undefined {
    if (this.incomingAmountValue) {
      return {
        value: this.incomingAmountValue,
        assetCode: this.asset.code,
        assetScale: this.asset.scale
      }
    }
    return undefined
  }

  public set incomingAmount(amount: Amount | undefined) {
    this.incomingAmountValue = amount?.value ?? null
  }

  public get receivedAmount(): Amount {
    return {
      value: this.receivedAmountValue || BigInt(0),
      assetCode: this.asset.code,
      assetScale: this.asset.scale
    }
  }
  public set receivedAmount(amount: Amount) {
    this.receivedAmountValue = amount.value
  }

  public async onCredit({
    totalReceived
  }: OnCreditOptions): Promise<IncomingPayment> {
    let incomingPayment
    if (this.incomingAmount && this.incomingAmount.value <= totalReceived) {
      incomingPayment = await IncomingPayment.query()
        .patchAndFetchById(this.id, {
          state: IncomingPaymentState.Completed,
          // Add 30 seconds to allow a prepared (but not yet fulfilled/rejected) packet to finish before sending webhook event.
          processAt: new Date(Date.now() + 30_000)
        })
        .whereNotIn('state', [
          IncomingPaymentState.Expired,
          IncomingPaymentState.Completed
        ])
    } else {
      incomingPayment = await IncomingPayment.query()
        .patchAndFetchById(this.id, {
          state: IncomingPaymentState.Processing
        })
        .whereNotIn('state', [
          IncomingPaymentState.Expired,
          IncomingPaymentState.Completed
        ])
    }
    if (incomingPayment) {
      return incomingPayment
    }
    return this
  }

  public toData(): IncomingPaymentData {
    return {
      incomingPayment: this.toResponse()
    }
  }

  public toResponse(): IncomingPaymentResponse {
    const incomingPayment: IncomingPaymentResponse = {
      id: this.id,
      accountId: this.accountId,
      createdAt: new Date(+this.createdAt).toISOString(),
      expiresAt: this.expiresAt.toISOString(),
      receivedAmount: {
        ...this.receivedAmount,
        value: this.receivedAmount.value.toString()
      },
      completed: this.state === IncomingPaymentState.Completed,
      updatedAt: new Date(+this.updatedAt).toISOString()
    }

    if (this.incomingAmount) {
      incomingPayment.incomingAmount = {
        ...this.incomingAmount,
        value: this.incomingAmount.value.toString()
      }
    }
    if (this.description) {
      incomingPayment.description = this.description
    }
    if (this.externalRef) {
      incomingPayment.externalRef = this.externalRef
    }
    return incomingPayment
  }

  $formatJson(json: Pojo): Pojo {
    json = super.$formatJson(json)
    return {
      id: json.id,
      accountId: json.accountId,
      incomingAmount: this.incomingAmount
        ? {
            ...json.incomingAmount,
            value: json.incomingAmount.value.toString()
          }
        : null,
      receivedAmount: {
        ...json.receivedAmount,
        value: json.receivedAmount.value.toString()
      },
      completed: !!(this.state === IncomingPaymentState.Completed),
      description: json.description,
      externalRef: json.externalRef,
      createdAt: json.createdAt,
      updatedAt: json.updatedAt,
      expiresAt: json.expiresAt.toISOString(),
      ilpStreamConnection: json.connectionId
    }
  }
}

export type IncomingPaymentJSON = {
  id: string
  accountId: string
  incomingAmount: AmountJSON | null
  receivedAmount: AmountJSON
  completed: boolean
  description: string | null
  externalRef: string | null
  createdAt: string
  updatedAt: string
  expiresAt: string
  ilpStreamConnection: string
}
