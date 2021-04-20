import { Model } from 'objection'
import { DbErrors } from 'objection-db-errors'
import { v4 as uuid } from 'uuid'

export class BaseModel extends DbErrors(Model) {
  public static get modelPaths(): string[] {
    return [__dirname]
  }

  public id!: string
  public createdAt!: string
  public updatedAt!: string

  public $beforeInsert(): void {
    this.id = this.id || uuid()
    this.createdAt = new Date().toISOString()
    this.updatedAt = new Date().toISOString()
  }

  public $beforeUpdate(): void {
    this.updatedAt = new Date().toISOString()
  }
}
