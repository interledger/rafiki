import { Model } from 'objection'
import { BaseModel } from '../shared/baseModel'
import { Limit } from './limits/model'
import { Grant } from '../grants/model'

export class AccessToken extends BaseModel {
  public static get tableName(): string {
    return 'accessTokens'
  }

  static relationMappings = {
    limits: {
      relation: Model.HasManyRelation,
      modelClass: Limit,
      join: {
        from: 'accessTokens.value',
        to: 'limits.accessToken'
      }
    },
    grant: {
      relation: Model.HasOneRelation,
      modelClass: Grant,
      join: {
        from: 'accessTokens.grantId',
        to: 'grants.id'
      }
    }
  }

  public value!: string
  public managementId!: string
  public grantId!: string
  public expiresIn?: number
}
