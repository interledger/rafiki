import { Model } from 'objection'
import { BaseModel } from '../shared/baseModel'
import { Grant } from '../grant/model'
import { LimitData, AccessType, Action } from './types'

export class Access extends BaseModel {
  public static get tableName(): string {
    return 'accesses'
  }

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  static relationMappings = () => ({
    grant: {
      relation: Model.HasOneRelation,
      modelClass: Grant,
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
  public locations?: string[]
  public interval?: string
  public limits?: LimitData
}
