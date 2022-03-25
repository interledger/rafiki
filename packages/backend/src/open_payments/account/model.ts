import { Model } from 'objection'

import { LiquidityAccount, OnCreditOptions } from '../../accounting/service'
import { ConnectorAccount } from '../../connector/core/rafiki'
import { Asset } from '../../asset/model'
import { BaseModel } from '../../shared/baseModel'
import { WebhookEvent } from '../../webhook/model'

export class Account
  extends BaseModel
  implements ConnectorAccount, LiquidityAccount {
  public static get tableName(): string {
    return 'accounts'
  }

  static relationMappings = {
    asset: {
      relation: Model.HasOneRelation,
      modelClass: Asset,
      join: {
        from: 'accounts.assetId',
        to: 'assets.id'
      }
    }
  }

  public publicName?: string

  public readonly assetId!: string
  public asset!: Asset

  // The cumulative received amount tracked by
  // `account.web_monetization` webhook events.
  // The value should be equivalent to the following query:
  // select sum(`withdrawalAmount`) from `webhookEvents` where `withdrawalAccountId` = `account.id`
  public totalEventsAmount!: bigint
  public processAt!: Date | null

  public async onCredit({
    totalReceived,
    withdrawalThrottleDelay
  }: OnCreditOptions): Promise<Account> {
    if (this.asset.withdrawalThreshold !== null) {
      const account = await Account.query()
        .patchAndFetchById(this.id, {
          processAt: new Date()
        })
        .whereRaw('?? <= ?', [
          'totalEventsAmount',
          totalReceived - this.asset.withdrawalThreshold
        ])
        .withGraphFetched('asset')
      if (account) {
        return account
      }
    }
    if (withdrawalThrottleDelay !== undefined && !this.processAt) {
      await this.$query().patch({
        processAt: new Date(Date.now() + withdrawalThrottleDelay)
      })
    }
    return this
  }

  public toData(received: bigint): AccountData {
    return {
      account: {
        id: this.id,
        createdAt: new Date(+this.createdAt).toISOString(),
        received: received.toString()
      }
    }
  }
}

export enum AccountEventType {
  AccountWebMonetization = 'account.web_monetization'
}

export type AccountData = {
  account: {
    id: string
    createdAt: string
    received: string
  }
}

export class AccountEvent extends WebhookEvent {
  public type!: AccountEventType
  public data!: AccountData
}
