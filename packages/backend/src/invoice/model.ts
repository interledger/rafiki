import { Model } from 'objection'
import { Account } from '../account/model'
import { BaseModel } from '../shared/baseModel'

export class Invoice extends BaseModel {
  public static get tableName(): string {
    return 'invoices'
  }

  static relationMappings = {
    account: {
      relation: Model.HasOneRelation,
      modelClass: Account,
      join: {
        from: 'invoices.accountId',
        to: 'accounts.id'
      }
    }
  }
  public account!: Account

  public paymentPointerId!: string // Refers to payment pointer this invoice is for
  public accountId!: string // Refers to the account created for this invoice
  public active!: boolean
  public description?: string
  public expiresAt?: Date
  public readonly amountToReceive?: bigint
}
