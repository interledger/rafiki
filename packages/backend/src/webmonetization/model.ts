import { Model } from 'objection'
import { Invoice } from '../open_payments/invoice/model'
import { BaseModel } from '../shared/baseModel'

export class WebMonetization extends BaseModel {
  public static get tableName(): string {
    return 'webMonetization'
  }

  static relationMappings = {
    invoice: {
      relation: Model.HasOneRelation,
      modelClass: Invoice,
      join: {
        from: 'webMonetization.invoiceId',
        to: 'invoices.id'
      }
    }
  }

  // Represents the id of the accounts table
  public id!: string
  public invoiceId!: string
  public invoice!: Invoice
}
