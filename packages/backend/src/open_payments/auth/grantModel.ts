import { Model } from 'objection'
import { DbErrors } from 'objection-db-errors'

export class Grant extends DbErrors(Model) {
  public static get modelPaths(): string[] {
    return [__dirname]
  }
  public static readonly tableName = 'grants'
  public id!: string
  public clientId!: string
}
