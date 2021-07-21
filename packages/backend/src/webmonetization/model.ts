import { BaseModel } from '../shared/baseModel'

export class WebMonetization extends BaseModel {
  public static get modelPaths(): string[] {
    return [__dirname]
  }

  public static get tableName(): string {
    return 'webMonetization'
  }

  static get idColumn(): string {
    return 'accountId'
  }

  public accountId!: string
  public currentInvoiceId!: string

  public $beforeInsert(): void {
    this.createdAt = new Date().toISOString()
    this.updatedAt = new Date().toISOString()
  }

  public $beforeUpdate(): void {
    this.updatedAt = new Date().toISOString()
  }
}
