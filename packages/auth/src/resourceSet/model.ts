import { Model } from 'objection'
import { BaseModel } from '../shared/baseModel'
import { JWKWithRequired } from '../client/service'
import { join } from 'path'

export class ResourceSet extends BaseModel {
  public static get tableName(): string {
    return 'resourceSets'
  }

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  static relationMappings = () => ({
    access: {
      relation: Model.HasManyRelation,
      modelClass: join(__dirname, '../access/model'),
      join: {
        from: 'resourceSets.id',
        to: 'accesses.resourceId'
      }
    }
  })

  public keyProof?: string
  public keyJwk?: JWKWithRequired
}
