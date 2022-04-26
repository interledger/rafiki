import { Model } from 'objection'
import { BaseModel } from '../shared/baseModel'

export class Grant extends BaseModel {
  public static get tableName(): string {
    return 'grants'
  }

  static relationMappings = {
    limits: {
      relation: Model.HasManyRelation,
      modelClass: AccessToken,
      join: {
        from: 'grants.id',
        to: 'accessTokens.value'
      }
    }
  }

  public id: string
  public continue: string
  // public access
}
