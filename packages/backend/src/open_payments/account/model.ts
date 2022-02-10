import { Model } from 'objection'
import parser from 'cron-parser'

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

  public readonly assetId!: string
  public asset!: Asset

  public totalEventsAmount!: bigint
  public processAt!: Date | null

  public async onCredit({
    totalReceived,
    withdrawalCron
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
    if (withdrawalCron && !this.processAt) {
      await this.$query().patch({
        processAt: parser.parseExpression(withdrawalCron).next().toDate()
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
