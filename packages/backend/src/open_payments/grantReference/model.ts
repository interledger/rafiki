import { Model } from 'objection'
import { DbErrors } from 'objection-db-errors'

export class GrantReference extends DbErrors(Model) {
  public static get modelPaths(): string[] {
    return [__dirname]
  }
  public static readonly tableName = 'grantReferences'
  public id!: string
  public clientId!: string
}
