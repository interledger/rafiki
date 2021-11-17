import { Model } from 'objection'
import { PaymentPointer } from '../payment_pointer/model'
import { BaseModel } from '../shared/baseModel'

export class Invoice extends BaseModel {
  public static get tableName(): string {
    return 'invoices'
  }

  static relationMappings = {
    paymentPointer: {
      relation: Model.HasOneRelation,
      modelClass: PaymentPointer,
      join: {
        from: 'invoices.paymentPointerId',
        to: 'paymentPointers.id'
      }
    }
  }

  public paymentPointerId!: string // Refers to payment pointer this invoice is for
  public paymentPointer!: PaymentPointer
  public active!: boolean
  public description?: string
  public expiresAt?: Date
  public readonly amountToReceive?: bigint
}
