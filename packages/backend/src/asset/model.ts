import { BaseModel } from '../shared/baseModel'
import { v4 as uuid } from 'uuid'

export class Asset extends BaseModel {
  public static get tableName(): string {
    return 'assets'
  }

  public readonly code!: string
  public readonly scale!: number

  // TigerBeetle account 2 byte unit field representing account's asset
  public readonly unit!: number

  // TigerBeetle account id tracking liquidity balance
  public balanceId!: string
  // TigerBeetle account id tracking settlement account balance
  public settlementBalanceId!: string
  // TigerBeetle account id tracking reserved outgoing payments balance
  public outgoingPaymentsBalanceId!: string
  // TigerBeetle account id for invoice receive limit
  public receiveLimitBalanceId!: string

  public $beforeInsert(): void {
    super.$beforeInsert()
    this.balanceId = this.balanceId || uuid()
    this.settlementBalanceId = this.settlementBalanceId || uuid()
    this.outgoingPaymentsBalanceId = this.outgoingPaymentsBalanceId || uuid()
    this.receiveLimitBalanceId = this.receiveLimitBalanceId || uuid()
  }
}
