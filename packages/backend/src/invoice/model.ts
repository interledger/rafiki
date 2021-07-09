import { BaseModel } from '../shared/baseModel'

export class Invoice extends BaseModel {
  public static get tableName(): string {
    return 'invoices'
  }

  public userId!: string
  public accountId!: string
  public active!: boolean
  public description!: string
  public expiresAt!: string
}
