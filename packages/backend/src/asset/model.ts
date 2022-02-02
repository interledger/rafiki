import { LiquidityAccount } from '../accounting/service'
import { BaseModel } from '../shared/baseModel'

export class Asset extends BaseModel implements LiquidityAccount {
  public static get tableName(): string {
    return 'assets'
  }

  public readonly code!: string
  public readonly scale!: number

  // TigerBeetle account 2 byte unit field representing account's asset
  public readonly unit!: number

  public get asset(): LiquidityAccount['asset'] {
    return {
      id: this.id,
      unit: this.unit
    }
  }
}
