import { Model, Pojo } from 'objection'
import { LiquidityAccount, OnDebitOptions } from '../accounting/service'
import { Asset } from '../asset/model'
import { ConnectorAccount } from '../connector/core/rafiki'
import { HttpToken } from '../httpToken/model'
import { BaseModel } from '../shared/baseModel'
import { WebhookEvent } from '../webhook/model'

export class Peer
  extends BaseModel
  implements ConnectorAccount, LiquidityAccount
{
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

  public readonly liquidityThreshold!: bigint | null

  public assetId!: string
  public asset!: Asset
  public incomingTokens!: HttpToken[]

  public http!: {
    outgoing: {
      authToken: string
      endpoint: string
    }
  }

  public maxPacketAmount?: bigint

  public staticIlpAddress!: string

  public name?: string

  public async onDebit({ balance }: OnDebitOptions): Promise<Peer> {
    if (this.liquidityThreshold !== null) {
      if (balance <= this.liquidityThreshold) {
        await WebhookEvent.query().insert({
          type: 'peer.liquidity_low',
          data: {
            id: this.id,
            asset: {
              id: this.asset.id,
              code: this.asset.code,
              scale: this.asset.scale
            },
            liquidityThreshold: this.liquidityThreshold,
            balance
          }
        })
      }
    }
    return this
  }

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
