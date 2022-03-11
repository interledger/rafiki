import { Model } from 'objection'
import { Account } from '../../account/model'
import { Asset } from '../../../asset/model'
import { LiquidityAccount, OnCreditOptions } from '../../../accounting/service'
import { ConnectorAccount } from '../../../connector/core/rafiki'
import { BaseModel } from '../../../shared/baseModel'
import { WebhookEvent } from '../../../webhook/model'

export enum IncomingPaymentEventType {
  IncomingPaymentExpired = 'incomingPayment.expired',
  IncomingPaymentPaid = 'incomingPayment.paid'
}

export enum IncomingPaymentState {
  // The payment has a state of `PENDING` when it is initially created.
  Pending = 'PENDING',
  // As soon as payment has started (funds have cleared into the account) the state moves to `PROCESSING`.
  Processing = 'PROCESSING',
  // The payment is either auto-competed once the received amount equals the expected amount `amount`,
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
    incomingAmount?: string
    receivedAmount: string
    externalRef?: string
    state: string
  }
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

  static relationMappings = {
    account: {
      relation: Model.HasOneRelation,
      modelClass: Account,
      join: {
        from: 'incomingPayments.accountId',
        to: 'accounts.id'
      }
    }
  }

  // Open payments account id this incoming payment is for
  public accountId!: string
  public account!: Account
  public active!: boolean
  public description?: string
  public expiresAt!: Date
  public state!: IncomingPaymentState
  public readonly incomingAmount?: bigint
  public externalRef?: string

  public processAt!: Date | null

  public get asset(): Asset {
    return this.account.asset
  }

  public async onCredit({
    totalReceived
  }: OnCreditOptions): Promise<IncomingPayment> {
    let incomingPayment
    if (this.incomingAmount && this.incomingAmount <= totalReceived) {
      incomingPayment = await IncomingPayment.query()
        .patchAndFetchById(this.id, {
          active: false,
          state: IncomingPaymentState.Completed,
          // Add 30 seconds to allow a prepared (but not yet fulfilled/rejected) packet to finish before sending webhook event.
          processAt: new Date(Date.now() + 30_000)
        })
        .where({
          active: true
        })
    } else {
      incomingPayment = await IncomingPayment.query()
        .patchAndFetchById(this.id, {
          state: IncomingPaymentState.Processing
        })
        .where({
          active: true
        })
    }
    if (incomingPayment) {
      return incomingPayment
    }
    return this
  }

  public toData(amountReceived: bigint): IncomingPaymentData {
    return {
      incomingPayment: {
        id: this.id,
        accountId: this.accountId,
        incomingAmount: this.incomingAmount
          ? this.incomingAmount.toString()
          : '',
        description: this.description,
        expiresAt: this.expiresAt.toISOString(),
        createdAt: new Date(+this.createdAt).toISOString(),
        receivedAmount: amountReceived.toString(),
        externalRef: this.externalRef ? this.externalRef.toString() : '',
        state: this.state
      }
    }
  }
}
