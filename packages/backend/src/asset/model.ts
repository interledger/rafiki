import { QueryContext } from 'objection'
import { LiquidityAccount, OnDebitOptions } from '../accounting/service'
import { BaseModel } from '../shared/baseModel'
import { WebhookEvent } from '../webhook/model'

export class Asset extends BaseModel implements LiquidityAccount {
  public static get tableName(): string {
    return 'assets'
  }

  public readonly code!: string
  public readonly scale!: number

  // TigerBeetle account 2 byte ledger field representing account's asset
  public readonly ledger!: number

  public readonly withdrawalThreshold!: bigint | null

  public readonly liquidityThresholdLow!: bigint | null

  public readonly liquidityThresholdHigh!: bigint | null

  public readonly deletedAt: string | null | undefined

  public get asset(): LiquidityAccount['asset'] {
    return {
      id: this.id,
      ledger: this.ledger,
      onDebit: this.onDebit
    }
  }

  private async checkAndInsertEvent(balance: bigint, threshold: bigint | null, eventType: AssetEventType) {
    if (threshold === null) {
      return
    }

    const isThresholdCrossed = (eventType === AssetEventType.LiquidityLow && balance <= threshold) || (eventType === AssetEventType.LiquidityHigh && balance >= threshold)

    if (isThresholdCrossed) {
      await AssetEvent.query().insert({
        assetId: this.id,
        type: eventType,
        data: {
          id: this.id,
          asset: {
            id: this.id,
            code: this.code,
            scale: this.scale
          },
          liquidityThreshold: threshold,
          balance
        }
      })
    }
  }

  public async onDebit({ balance }: OnDebitOptions): Promise<Asset> {
    await Promise.all([
      this.checkAndInsertEvent(balance, this.liquidityThresholdLow, AssetEventType.LiquidityLow),
      this.checkAndInsertEvent(balance, this.liquidityThresholdHigh, AssetEventType.LiquidityHigh)
    ])

    return this
  }
}

export enum AssetEventType {
  LiquidityLow = 'asset.liquidity_low',
  LiquidityHigh = 'asset.liquidity_high'
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
