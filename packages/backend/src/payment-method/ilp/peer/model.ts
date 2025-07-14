import { Model, Pojo, QueryContext } from 'objection'
import { LiquidityAccount, OnDebitOptions } from '../../../accounting/service'
import { Asset } from '../../../asset/model'
import { ConnectorAccount } from '../connector/core/rafiki'
import { HttpToken } from '../peer-http-token/model'
import { BaseModel } from '../../../shared/baseModel'
import { WebhookEvent } from '../../../webhook/event/model'
import { join } from 'path'
import { IAppConfig } from '../../../config/app'
import { finalizeWebhookRecipients } from '../../../webhook/service'

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
      modelClass: join(__dirname, '../peer-http-token/model'),
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

  public readonly tenantId!: string

  public async onDebit(
    { balance }: OnDebitOptions,
    config: IAppConfig
  ): Promise<Peer> {
    if (this.liquidityThreshold !== null) {
      if (balance <= this.liquidityThreshold) {
        await PeerEvent.query().insertGraph({
          peerId: this.id,
          type: PeerEventType.LiquidityLow,
          data: {
            id: this.id,
            asset: {
              id: this.asset.id,
              code: this.asset.code,
              scale: this.asset.scale
            },
            liquidityThreshold: this.liquidityThreshold,
            balance
          },
          tenantId: this.tenantId,
          webhooks: finalizeWebhookRecipients([this.tenantId], config)
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

export enum PeerEventType {
  LiquidityLow = 'peer.liquidity_low'
}

export type PeerEventData = {
  id: string
  asset: {
    id: string
    code: string
    scale: number
  }
  liquidityThreshold: bigint | null
  balance: bigint
}

export enum PeerEventError {
  PeerIdRequired = 'Peer ID is required for peer events'
}

export class PeerEvent extends WebhookEvent {
  public type!: PeerEventType
  public data!: PeerEventData

  public $beforeInsert(context: QueryContext): void {
    super.$beforeInsert(context)

    if (!this.peerId) {
      throw new Error(PeerEventError.PeerIdRequired)
    }
  }
}
