import { Model } from 'objection'
import { Account } from '../account/model'
import { Asset } from '../../asset/model'
import { LiquidityAccount } from '../../accounting/service'
import { ConnectorAccount } from '../../connector/core/rafiki'
import { BaseModel } from '../../shared/baseModel'
import { WebhookEvent } from '../../webhook/model'

export class Invoice
  extends BaseModel
  implements ConnectorAccount, LiquidityAccount {
  public static get tableName(): string {
    return 'invoices'
  }

  static relationMappings = {
    account: {
      relation: Model.HasOneRelation,
      modelClass: Account,
      join: {
        from: 'invoices.accountId',
        to: 'accounts.id'
      }
    }
  }

  // Open payments account id this invoice is for
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

  public async onCredit(balance: bigint): Promise<void> {
    if (balance >= this.amount) {
      return await Invoice.transaction(async (trx) => {
        await this.$query(trx).patch({
          active: false
        })
        await InvoiceEvent.query(trx).insertAndFetch({
          type: InvoiceEventType.InvoicePaid,
          data: this.toData(balance),
          // TODO:
          // Add 30 seconds to allow a prepared (but not yet fulfilled/rejected) packet to finish before being deactivated.
          // But balance is fixed in the webhook event data.
          processAt: new Date()
        })
      })
    }
  }

  public toData(amountReceived: bigint): InvoiceData {
    return {
      invoice: {
        id: this.id,
        accountId: this.accountId,
        active: this.active,
        amount: this.amount.toString(),
        description: this.description,
        expiresAt: this.expiresAt.toISOString(),
        createdAt: new Date(+this.createdAt).toISOString(),
        received: amountReceived.toString()
      }
    }
  }
}

export enum InvoiceEventType {
  InvoiceExpired = 'invoice.expired',
  InvoicePaid = 'invoice.paid'
}

export type InvoiceData = {
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

export class InvoiceEvent extends WebhookEvent {
  public type!: InvoiceEventType
  public data!: InvoiceData
}
