import { Pojo } from 'objection'

import { BaseModel } from '../shared/baseModel'
import { join } from 'path'
import { OutgoingPayment } from '../open_payments/payment/outgoing/model'
import { IncomingPayment } from '../open_payments/payment/incoming/model'
import { WalletAddress } from '../open_payments/wallet_address/model'
import { Asset } from '../asset/model'
import { Peer } from '../payment-method/ilp/peer/model'

const fieldPrefixes = ['withdrawal']

export class WebhookEvent extends BaseModel {
  public static get tableName(): string {
    return 'webhookEvents'
  }

  static relationMappings = () => ({
    outgoingPayment: {
      relation: BaseModel.BelongsToOneRelation,
      modelClass: join(__dirname, '../open_payments/payment/outgoing/model'),
      join: {
        from: 'webhookEvents.outgoingPaymentId',
        to: 'outgoingPayments.id'
      }
    },
    incomingPayment: {
      relation: BaseModel.BelongsToOneRelation,
      modelClass: join(__dirname, '../open_payments/payment/incoming/model'),
      join: {
        from: 'webhookEvents.incomingPaymentId',
        to: 'incomingPayments.id'
      }
    },
    walletAddress: {
      relation: BaseModel.BelongsToOneRelation,
      modelClass: join(__dirname, '../open_payments/wallet_address/model'),
      join: {
        from: 'webhookEvents.walletAddressId',
        to: 'walletAddresses.id'
      }
    },
    asset: {
      relation: BaseModel.BelongsToOneRelation,
      modelClass: join(__dirname),
      join: {
        from: 'webhookEvents.assetId',
        to: 'assets.id'
      }
    },
    peer: {
      relation: BaseModel.BelongsToOneRelation,
      modelClass: join(__dirname, '../payment-method/ilp/peer/model'),
      join: {
        from: 'webhookEvents.peerId',
        to: 'peer.id'
      }
    }
  })

  public type!: WebhookEventType
  public data!: Record<string, unknown>
  public attempts!: number
  public statusCode?: number
  public processAt!: Date | null
  public depositAccountId?: string

  public readonly outgoingPaymentId?: string
  public readonly incomingPaymentId?: string
  public readonly walletAddressId?: string
  public readonly assetId?: string
  public readonly peerId?: string

  public outgoingPayment?: OutgoingPayment
  public incomingPayment?: IncomingPayment
  public walletAddress?: WalletAddress
  public asset?: Asset
  public peer?: Peer

  public withdrawal?: {
    accountId: string
    assetId: string
    amount: bigint
  }

  $formatDatabaseJson(json: Pojo): Pojo {
    // transforms WebhookEvent.withdrawal to db fields. eg. withdrawal.accountId => withdrawalAccountId
    for (const prefix of fieldPrefixes) {
      if (!json[prefix]) continue
      for (const key in json[prefix]) {
        json[prefix + key.charAt(0).toUpperCase() + key.slice(1)] =
          json[prefix][key]
      }
      delete json[prefix]
    }
    return super.$formatDatabaseJson(json)
  }

  $parseDatabaseJson(json: Pojo): Pojo {
    // transforms withdrawal db fields to WebhookEvent.withdrawal. eg. withdrawalAccountId => withdrawal.accountId
    json = super.$parseDatabaseJson(json)
    for (const key in json) {
      const prefix = fieldPrefixes.find((prefix) => key.startsWith(prefix))
      if (!prefix) continue
      if (json[key] !== null) {
        if (!json[prefix]) json[prefix] = {}
        json[prefix][
          key.charAt(prefix.length).toLowerCase() + key.slice(prefix.length + 1)
        ] = json[key]
      }
      delete json[key]
    }
    return json
  }
}

export enum WebhookEventType {
  IncomingPaymentCreated = 'INCOMING_PAYMENT_CREATED',
  IncomingPaymentCompleted = 'INCOMING_PAYMENT_COMPLETED',
  IncomingPaymentExpired = 'INCOMING_PAYMENT_EXPIRED',
  OutgoingPaymentCreated = 'OUTGOING_PAYMENT_CREATED',
  OutgoingPaymentCompleted = 'OUTGOING_PAYMENT_COMPLETED',
  OutgoingPaymentFailed = 'OUTGOING_PAYMENT_FAILED',
  WalletAddressWebMonetization = 'WALLET_ADDRESS_WEB_MONETIZATION',
  WalletAddressNotFound = 'WALLET_ADDRESS_NOT_FOUND',
  AssetLiquidityLow = 'ASSET_LIQUIDITY_LOW',
  PeerLiquidityLow = 'PEER_LIQUIDITY_LOW'
}
