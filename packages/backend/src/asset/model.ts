import { QueryContext } from 'objection'
import { LiquidityAccount, OnDebitOptions } from '../accounting/service'
import { BaseModel } from '../shared/baseModel'
import { WebhookEvent } from '../webhook/event/model'
import { IAppConfig } from '../config/app'
import { finalizeWebhookRecipients } from '../webhook/service'

export class Asset extends BaseModel implements LiquidityAccount {
  public static get tableName(): string {
    return 'assets'
  }

  public readonly code!: string
  public readonly scale!: number

  // TigerBeetle account 2 byte ledger field representing account's asset
  public readonly ledger!: number
  public readonly tenantId!: string

  public readonly withdrawalThreshold!: bigint | null

  public readonly liquidityThreshold!: bigint | null

  public readonly deletedAt: string | null | undefined

  public get asset(): LiquidityAccount['asset'] {
    return {
      id: this.id,
      ledger: this.ledger,
      onDebit: this.onDebit
    }
  }

  public async onDebit(
    { balance }: OnDebitOptions,
    config: IAppConfig
  ): Promise<Asset> {
    if (this.liquidityThreshold !== null) {
      if (balance <= this.liquidityThreshold) {
        await AssetEvent.query().insertGraph({
          assetId: this.id,
          type: AssetEventType.LiquidityLow,
          data: {
            id: this.id,
            asset: {
              id: this.id,
              code: this.code,
              scale: this.scale
            },
            liquidityThreshold: this.liquidityThreshold,
            balance
          },
          tenantId: this.tenantId,
          webhooks: finalizeWebhookRecipients([this.tenantId], config)
        })
      }
    }
    return this
  }
}

export enum AssetEventType {
  LiquidityLow = 'asset.liquidity_low'
}

export type AssetEventData = {
  id: string
  asset: {
    id: string
    code: string
    scale: number
  }
  liquidityThreshold: bigint | null
  balance: bigint
}

export enum AssetEventError {
  AssetIdRequired = 'Asset ID is required for asset events'
}

export class AssetEvent extends WebhookEvent {
  public type!: AssetEventType
  public data!: AssetEventData

  public $beforeInsert(context: QueryContext): void {
    super.$beforeInsert(context)

    if (!this.assetId) {
      throw new Error(AssetEventError.AssetIdRequired)
    }
  }
}
