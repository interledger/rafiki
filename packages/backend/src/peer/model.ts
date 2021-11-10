import { Model, Pojo } from 'objection'
import { Account } from '../tigerbeetle/account/model'
import { HttpToken } from '../httpToken/model'
import { BaseModel } from '../shared/baseModel'

export class Peer extends BaseModel {
  public static get tableName(): string {
    return 'peers'
  }

  static relationMappings = {
    account: {
      relation: Model.HasOneRelation,
      modelClass: Account,
      join: {
        from: 'peers.accountId',
        to: 'accounts.id'
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

  public accountId!: string
  public account!: Account

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
