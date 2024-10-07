import { QueryContext } from 'objection'
import { LiquidityAccount, OnDebitOptions } from '../accounting/service'
import { BaseModel } from '../shared/baseModel'
import { WebhookEvent, WebhookEventType } from '../webhook/model'

export class Asset extends BaseModel implements LiquidityAccount {
  public static get tableName(): string {
    return 'assets'
  }

  public readonly code!: string
  public readonly scale!: number

  // TigerBeetle account 2 byte ledger field representing account's asset
  public readonly ledger!: number

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

  public async onDebit({ balance }: OnDebitOptions): Promise<Asset> {
    if (this.liquidityThreshold !== null) {
      if (balance <= this.liquidityThreshold) {
        await AssetEvent.query().insert({
          assetId: this.id,
          type: WebhookEventType.AssetLiquidityLow,
          data: {
            id: this.id,
            asset: {
              id: this.id,
              code: this.code,
              scale: this.scale
            },
            liquidityThreshold: this.liquidityThreshold,
            balance
          }
        })
      }
    }
    return this
  }
}

export type AssetEventType = Extract<
  WebhookEventType,
  WebhookEventType.AssetLiquidityLow
>
export const AssetEventType = [WebhookEventType.AssetLiquidityLow]

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
