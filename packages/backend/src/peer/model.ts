import { Model, Pojo } from 'objection'
import { Account as TigerbeetleAccount } from '../accounting/service'
import { Asset } from '../asset/model'
import { ConnectorAccount } from '../connector/core/rafiki'
import { HttpToken } from '../httpToken/model'
import { BaseModel } from '../shared/baseModel'

export class Peer
  extends BaseModel
  implements ConnectorAccount, TigerbeetleAccount {
  public static get tableName(): string {
    return 'peers'
  }

  static relationMappings = {
    asset: {
      relation: Model.HasOneRelation,
      modelClass: Asset,
      join: {
        from: 'peers.assetId',
        to: 'assets.id'
      }
    },
    incomingTokens: {
      relation: Model.HasManyRelation,
      modelClass: HttpToken,
      join: {
        from: 'peers.id',
        to: 'httpTokens.peerId'
      }
    }
  }

  public assetId!: string
  public asset!: Asset

  public http!: {
    outgoing: {
      authToken: string
      endpoint: string
    }
  }

  public maxPacketAmount?: bigint

  public staticIlpAddress!: string

  $formatDatabaseJson(json: Pojo): Pojo {
    if (json.http?.outgoing) {
      json.outgoingToken = json.http.outgoing.authToken
      json.outgoingEndpoint = json.http.outgoing.endpoint
      delete json.http
    }
    return super.$formatDatabaseJson(json)
  }

  $parseDatabaseJson(json: Pojo): Pojo {
    const formattedJson = super.$parseDatabaseJson(json)
    if (formattedJson.outgoingToken) {
      formattedJson.http = {
        outgoing: {
          authToken: formattedJson.outgoingToken,
          endpoint: formattedJson.outgoingEndpoint
        }
      }
      delete formattedJson.outgoingToken
      delete formattedJson.outgoingEndpoint
    }
    return formattedJson
  }
}
