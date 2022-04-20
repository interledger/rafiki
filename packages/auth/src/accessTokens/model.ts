import { Model } from 'objection'
import { BaseModel } from '../shared/baseModel'
import { Limit } from './limits/model'

enum Actions {
  Create = 'create',
  Read = 'read'
}

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
        to: 'limits.id'
      }
    }
  }

  public value!: string
  public type!: string
  public managementId!: string
  public actions!: Actions[]
}
