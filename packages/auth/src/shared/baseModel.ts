import { Model } from 'objection'
import { DbErrors } from 'objection-db-errors'
import { v4 as uuid } from 'uuid'

export abstract class BaseModel extends DbErrors(Model) {
  public static get modelPaths(): string[] {
    return [__dirname]
  }

  public id!: string
  public createdAt!: Date
  public updatedAt!: Date

  public $beforeInsert(): void {
    this.id = this.id || uuid()
    this.createdAt = new Date()
    this.updatedAt = new Date()
  }

  public $beforeUpdate(): void {
    this.updatedAt = new Date()
  }
}
