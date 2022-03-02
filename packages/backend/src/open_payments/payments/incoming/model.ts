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

export type IncomingPaymentData = {
  incomingPayment: {
    id: string
    accountId: string
    description?: string
    createdAt: string
    expiresAt: string
    amount: string
    received: string
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
  public readonly amount!: bigint

  public processAt!: Date | null

  public get asset(): Asset {
    return this.account.asset
  }

  public async onCredit({
    totalReceived
  }: OnCreditOptions): Promise<IncomingPayment> {
    if (this.amount <= totalReceived) {
      const incomingPayment = await IncomingPayment.query()
        .patchAndFetchById(this.id, {
          active: false,
          // Add 30 seconds to allow a prepared (but not yet fulfilled/rejected) packet to finish before sending webhook event.
          processAt: new Date(Date.now() + 30_000)
        })
        .where({
          active: true
        })
      if (incomingPayment) {
        return incomingPayment
      }
    }
    return this
  }

  public toData(amountReceived: bigint): IncomingPaymentData {
    return {
      incomingPayment: {
        id: this.id,
        accountId: this.accountId,
        amount: this.amount.toString(),
        description: this.description,
        expiresAt: this.expiresAt.toISOString(),
        createdAt: new Date(+this.createdAt).toISOString(),
        received: amountReceived.toString()
      }
    }
  }
}
