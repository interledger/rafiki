import { Model } from 'objection'
import { Account } from '../../account/model'
import { Asset } from '../../../asset/model'
import { LiquidityAccount, OnCreditOptions } from '../../../accounting/service'
import { ConnectorAccount } from '../../../connector/core/rafiki'
import { BaseModel } from '../../../shared/baseModel'
import { WebhookEvent } from '../../../webhook/model'

export enum IncomingPaymentEventType {
  IncomingPaymentExpired = 'incoming_payment.expired',
  IncomingPaymentCompleted = 'incoming_payment.completed'
}

export enum IncomingPaymentState {
  // The payment has a state of `PENDING` when it is initially created.
  Pending = 'PENDING',
  // As soon as payment has started (funds have cleared into the account) the state moves to `PROCESSING`.
  Processing = 'PROCESSING',
  // The payment is either auto-completed once the received amount equals the expected amount `amount`,
  // or it is completed manually via an API call.
  Completed = 'COMPLETED',
  // If the payment expires before it is completed then the state will move to `EXPIRED`
  // and no further payments will be accepted.
  Expired = 'EXPIRED'
}

export type IncomingPaymentData = {
  incomingPayment: {
    id: string
    accountId: string
    description?: string
    createdAt: string
    expiresAt: string
    incomingAmount?: Amount
    receivedAmount: Amount
    externalRef?: string
    state: string
    receiptsEnabled: boolean
  }
}

export interface Amount {
  amount: bigint
  assetCode: string
  assetScale: number
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
    return ['incomingAmount']
  }

  static relationMappings = {
    account: {
      relation: Model.HasOneRelation,
      modelClass: Account,
      join: {
        from: 'incomingPayments.accountId',
        to: 'accounts.id'
      }
    },
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
  public account!: Account
  public description?: string
  public expiresAt!: Date
  public state!: IncomingPaymentState
  public externalRef?: string
  public receiptsEnabled!: boolean

  public processAt!: Date | null

  public readonly assetId!: string
  public asset!: Asset

  private incomingAmountValue?: bigint | null

  public get incomingAmount(): Amount | undefined {
    if (this.incomingAmountValue) {
      return {
        amount: this.incomingAmountValue,
        assetCode: this.asset.code,
        assetScale: this.asset.scale
      }
    }
    return undefined
  }

  public set incomingAmount(value: Amount | undefined) {
    this.incomingAmountValue = value?.amount ?? null
  }

  public async onCredit({
    totalReceived
  }: OnCreditOptions): Promise<IncomingPayment> {
    let incomingPayment
    if (this.incomingAmount && this.incomingAmount.amount <= totalReceived) {
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

  public toData(amountReceived: bigint): IncomingPaymentData {
    const data: IncomingPaymentData = {
      incomingPayment: {
        id: this.id,
        accountId: this.accountId,
        createdAt: new Date(+this.createdAt).toISOString(),
        expiresAt: this.expiresAt.toISOString(),
        receivedAmount: {
          amount: amountReceived,
          assetCode: this.asset.code,
          assetScale: this.asset.scale
        },
        state: this.state,
        receiptsEnabled: this.receiptsEnabled
      }
    }

    if (this.incomingAmount) {
      data.incomingPayment.incomingAmount = this.incomingAmount
    }
    if (this.description) {
      data.incomingPayment.description = this.description
    }
    if (this.externalRef) {
      data.incomingPayment.externalRef = this.externalRef
    }

    return data
  }
}
