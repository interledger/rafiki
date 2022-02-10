import { Model } from 'objection'
import { Account } from '../account/model'
import { Asset } from '../../asset/model'
import { LiquidityAccount } from '../../accounting/service'
import { ConnectorAccount } from '../../connector/core/rafiki'
import { BaseModel } from '../../shared/baseModel'
import { WebhookEvent } from '../../webhook/model'

export enum InvoiceEventType {
  InvoiceExpired = 'invoice.expired',
  InvoicePaid = 'invoice.paid'
}

export type InvoiceData = {
  invoice: {
    id: string
    accountId: string
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
    },
    event: {
      relation: Model.HasOneRelation,
      modelClass: InvoiceEvent,
      join: {
        from: 'invoices.eventId',
        to: 'webhookEvents.id'
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
  public eventId?: string
  public event?: InvoiceEvent

  public processAt!: Date | null

  public get asset(): Asset {
    return this.account.asset
  }

  public async onCredit(balance: bigint): Promise<Invoice> {
    if (this.active && balance < this.amount) {
      return this
    }
    return await Invoice.transaction(async (trx) => {
      this.event = await this.$relatedQuery('event', trx)
        // Ensure the event cannot be processed concurrently.
        .forUpdate()
        .first()
      if (
        !this.event ||
        this.event.attempts ||
        this.event.processAt.getTime() <= Date.now()
      ) {
        this.event = await InvoiceEvent.query(trx).insertAndFetch({
          type: InvoiceEventType.InvoicePaid,
          data: this.toData(balance),
          // Add 30 seconds to allow a prepared (but not yet fulfilled/rejected) packet to finish before creating withdrawal.
          processAt: new Date(Date.now() + 30_000),
          withdrawal: {
            accountId: this.id,
            assetId: this.account.assetId,
            amount: balance
          }
        })
        await this.$query(trx).patch({
          active: false,
          eventId: this.event.id
        })
      } else {
        // Update the event withdrawal amount if the withdrawal hasn't been created (event.attempts === 0).
        await this.event.$query(trx).patchAndFetch({
          data: this.toData(balance),
          // Add 30 seconds to allow additional prepared packets to finish before creating withdrawal.
          processAt: new Date(Date.now() + 30_000),
          withdrawal: {
            accountId: this.id,
            assetId: this.account.assetId,
            amount: balance
          }
        })
      }
      return this
    })
  }

  public toData(amountReceived: bigint): InvoiceData {
    return {
      invoice: {
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
