import { BaseModel } from '../shared/baseModel'

export class PaymentProgress extends BaseModel {
  public static readonly tableName = 'paymentProgress'

  public readonly amountSent!: bigint
  public readonly amountDelivered!: bigint
}
