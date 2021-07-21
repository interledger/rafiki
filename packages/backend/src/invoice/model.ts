import { BaseModel } from '../shared/baseModel'

export class Invoice extends BaseModel {
  public static get tableName(): string {
    return 'invoices'
  }

  public accountId!: string // Refers to which account this invoice is for
  public invoiceAccountId!: string // Refers to the subaccount created for this invoice
  public active!: boolean
  public description!: string
  public expiresAt!: Date
}
