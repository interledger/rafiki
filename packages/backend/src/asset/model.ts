import { LiquidityAccount, OnDebitOptions } from '../accounting/service'
import { BaseModel } from '../shared/baseModel'

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
  public processAt!: Date | null

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
        await this.$query().patch({
          processAt: new Date(Date.now())
        })
      }
    }
    return this
  }
}
