import { Model } from 'objection'
import { BaseModel } from '../shared/baseModel'
import { LimitData } from './types'
import { join } from 'path'
import { AccessType, Action } from 'open-payments/dist/types'

export class Access extends BaseModel {
  public static get tableName(): string {
    return 'accesses'
  }

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  static relationMappings = () => ({
    grant: {
      relation: Model.HasOneRelation,
      modelClass: join(__dirname, '../grant/model'),
      join: {
        from: 'accesses.grantId',
        to: 'grants.id'
      }
    }
  })

  public id!: string
  public grantId!: string
  public type!: AccessType
  public actions!: Action[]
  public identifier?: string
  public limits?: LimitData
}
