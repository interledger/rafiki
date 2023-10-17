import { Model } from 'objection'
import { BaseModel } from '../../../shared/baseModel'
import { Peer } from '../peer/model'

export class IlpPeer extends BaseModel {
  public static get tableName(): string {
    return 'ilpPeers'
  }

  static relationMappings = {
    peer: {
      relation: Model.HasOneRelation,
      modelClass: Peer,
      join: {
        from: 'ilpPeers.peerId',
        to: 'peers.id'
      }
    }
  }

  public peerId!: string
  public peer!: Peer

  public maxPacketAmount?: bigint
  public staticIlpAddress!: string
}
