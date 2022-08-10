import { Model } from 'objection'

import { AmountJSON } from '../amount'
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
}

export const isWebMonetizationEventType = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  o: any
): o is WebMonetizationEventType =>
  Object.values(WebMonetizationEventType).includes(o)

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isWebMonetizationEvent = (o: any): o is WebMonetizationEvent =>
  o instanceof WebhookEvent && isWebMonetizationEventType(o.type)

export class WebMonetizationEvent extends WebhookEvent {
  public type!: WebMonetizationEventType
  public data!: WebMonetizationData
}

export enum WebMonetizationEventType {
  WebMonetizationReceived = 'WEB_MONETIZATION_RECEIVED'
}

export type WebMonetizationData = {
  webMonetization: {
    accountId: string
    amount: AmountJSON
  }
}
