import { Model } from 'objection'
import { join } from 'path'
import { BaseModel } from '../shared/baseModel'

export enum InteractionState {
  Pending = 'PENDING',
  Accepted = 'ACCEPTED',
  Rejected = 'REJECTED'
}

export class Interaction extends BaseModel {
  public static get tableName(): string {
    return 'interactions'
  }

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
  public ref!: string
  public nonce!: string // AS-generated nonce for post-interaction hash
  public state!: InteractionState
}
