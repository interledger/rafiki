import { Model } from 'objection'
import { Peer } from '../peer/model'
import { BaseModel } from '../../../shared/baseModel'

export class HttpToken extends BaseModel {
  public static get tableName(): string {
    return 'httpTokens'
  }

  static relationMappings = {
    peer: {
      relation: Model.HasOneRelation,
      modelClass: Peer,
      join: {
        from: 'httpTokens.peerId',
        to: 'peers.id'
      }
    }
  }

  public readonly token!: string
  public readonly peerId!: string
  public peer!: Peer
}
