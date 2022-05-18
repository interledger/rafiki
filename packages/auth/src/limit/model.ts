import { Model } from 'objection'
import { BaseModel } from '../shared/baseModel'
import { AccessToken } from '../accessToken/model'
import { Grant } from '../grant/model'
import { LimitData } from './types'

export class Limit extends BaseModel {
  public static get tableName(): string {
    return 'limits'
  }

  static relationMappings = {
    accessToken: {
      relation: Model.HasOneRelation,
      modelClass: AccessToken,
      join: {
        from: 'limits.accessToken',
        to: 'accessTokens.value'
      }
    },
    grant: {
      relation: Model.HasOneRelation,
      modelClass: Grant,
      join: {
        from: 'limits.grantId',
        to: 'grants.id'
      }
    }
  }

  public id!: string
  public accessToken?: string
  public grantId!: string
  public data!: LimitData

  public createdById?: string
  public description?: string
  public externalRef?: string
}
