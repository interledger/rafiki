import { Model } from 'objection'

import { Amount, AmountJSON, serializeAmount } from '../../amount'
import { Connection } from '../../connection/service'
import {
  WalletAddress,
  WalletAddressSubresource
} from '../../wallet_address/model'
import { Asset } from '../../../asset/model'
import { LiquidityAccount, OnCreditOptions } from '../../../accounting/service'
import { ConnectorAccount } from '../../../payment-method/ilp/connector/core/rafiki'
import { WebhookEvent } from '../../../webhook/model'
import {
  IncomingPayment as OpenPaymentsIncomingPayment,
  IncomingPaymentWithPaymentMethods as OpenPaymentsIncomingPaymentWithPaymentMethod
} from '@interledger/open-payments'
import base64url from 'base64url'

export enum IncomingPaymentEventType {
  IncomingPaymentCreated = 'incoming_payment.created',
  IncomingPaymentExpired = 'incoming_payment.expired',
  IncomingPaymentCompleted = 'incoming_payment.completed'
}

export enum IncomingPaymentState {
  // The payment has a state of `PENDING` when it is initially created.
  Pending = 'PENDING',
  // As soon as payment has started (funds have cleared into the account) the state moves to `PROCESSING`.
  Processing = 'PROCESSING',
  // The payment is either auto-completed once the received amount equals the expected `incomingAmount`,
  // or it is completed manually via an API call.
  Completed = 'COMPLETED',
  // If the payment expires before it is completed then the state will move to `EXPIRED`
  // and no further payments will be accepted.
  Expired = 'EXPIRED'
}

export interface IncomingPaymentResponse {
  id: string
  walletAddressId: string
  createdAt: string
  updatedAt: string
  expiresAt: string
  incomingAmount?: AmountJSON
  receivedAmount: AmountJSON
  completed: boolean
  metadata?: Record<string, unknown>
}

export type IncomingPaymentData = {
  incomingPayment: IncomingPaymentResponse
}

export class IncomingPaymentEvent extends WebhookEvent {
  public type!: IncomingPaymentEventType
  public data!: IncomingPaymentData
}

export class IncomingPayment
  extends WalletAddressSubresource
  implements ConnectorAccount, LiquidityAccount
{
  public static get tableName(): string {
    return 'incomingPayments'
  }
  public static readonly urlPath = '/incoming-payments'

  static get virtualAttributes(): string[] {
    return ['completed', 'incomingAmount', 'receivedAmount', 'url']
  }

  static get relationMappings() {
    return {
      ...super.relationMappings,
      asset: {
        relation: Model.HasOneRelation,
        modelClass: Asset,
        join: {
          from: 'incomingPayments.assetId',
          to: 'assets.id'
        }
      }
    }
  }

  public expiresAt!: Date
  public state!: IncomingPaymentState
  public metadata?: Record<string, unknown>

  public processAt!: Date | null

  public readonly assetId!: string
  public asset!: Asset

  private incomingAmountValue?: bigint | null
  private receivedAmountValue?: bigint

  public get completed(): boolean {
    return this.state === IncomingPaymentState.Completed
  }

  public get incomingAmount(): Amount | undefined {
    if (this.incomingAmountValue) {
      return {
        value: this.incomingAmountValue,
        assetCode: this.asset.code,
        assetScale: this.asset.scale
      }
    }
    return undefined
  }

  public set incomingAmount(amount: Amount | undefined) {
    this.incomingAmountValue = amount?.value ?? null
  }

  public get receivedAmount(): Amount {
    return {
      value: this.receivedAmountValue || BigInt(0),
      assetCode: this.asset.code,
      assetScale: this.asset.scale
    }
  }

  public set receivedAmount(amount: Amount) {
    this.receivedAmountValue = amount.value
  }

  public getUrl(walletAddress: WalletAddress): string {
    return `${walletAddress.url}${IncomingPayment.urlPath}/${this.id}`
  }

  public async onCredit({
    totalReceived
  }: OnCreditOptions): Promise<IncomingPayment> {
    let incomingPayment
    if (this.incomingAmount && this.incomingAmount.value <= totalReceived) {
      incomingPayment = await IncomingPayment.query()
        .patchAndFetchById(this.id, {
          state: IncomingPaymentState.Completed,
          // Add 30 seconds to allow a prepared (but not yet fulfilled/rejected) packet to finish before sending webhook event.
          processAt: new Date(Date.now() + 30_000)
        })
        .whereNotIn('state', [
          IncomingPaymentState.Expired,
          IncomingPaymentState.Completed
        ])
    } else {
      incomingPayment = await IncomingPayment.query()
        .patchAndFetchById(this.id, {
          state: IncomingPaymentState.Processing
        })
        .whereNotIn('state', [
          IncomingPaymentState.Expired,
          IncomingPaymentState.Completed
        ])
    }
    if (incomingPayment) {
      return incomingPayment
    }
    return this
  }

  public toData(amountReceived: bigint): IncomingPaymentData {
    const data: IncomingPaymentData = {
      incomingPayment: {
        id: this.id,
        walletAddressId: this.walletAddressId,
        createdAt: new Date(+this.createdAt).toISOString(),
        expiresAt: this.expiresAt.toISOString(),
        receivedAmount: {
          value: amountReceived.toString(),
          assetCode: this.asset.code,
          assetScale: this.asset.scale
        },
        completed: this.completed,
        updatedAt: new Date(+this.updatedAt).toISOString()
      }
    }

    if (this.incomingAmount) {
      data.incomingPayment.incomingAmount = {
        ...this.incomingAmount,
        value: this.incomingAmount.value.toString()
      }
    }
    if (this.metadata) {
      data.incomingPayment.metadata = this.metadata
    }

    return data
  }

  public toOpenPaymentsType(
    walletAddress: WalletAddress
  ): OpenPaymentsIncomingPayment
  public toOpenPaymentsType(
    walletAddress: WalletAddress,
    ilpStreamConnection: Connection
  ): OpenPaymentsIncomingPaymentWithPaymentMethod
  public toOpenPaymentsType(
    walletAddress: WalletAddress,
    ilpStreamConnection?: Connection
  ): OpenPaymentsIncomingPayment | OpenPaymentsIncomingPaymentWithPaymentMethod

  public toOpenPaymentsType(
    walletAddress: WalletAddress,
    ilpStreamConnection?: Connection
  ):
    | OpenPaymentsIncomingPayment
    | OpenPaymentsIncomingPaymentWithPaymentMethod {
    const baseIncomingPayment: OpenPaymentsIncomingPayment = {
      id: this.getUrl(walletAddress),
      walletAddress: walletAddress.url,
      incomingAmount: this.incomingAmount
        ? serializeAmount(this.incomingAmount)
        : undefined,
      receivedAmount: serializeAmount(this.receivedAmount),
      completed: this.completed,
      metadata: this.metadata ?? undefined,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      expiresAt: this.expiresAt.toISOString()
    }

    if (ilpStreamConnection) {
      return {
        ...baseIncomingPayment,
        methods: [
          {
            type: 'ilp',
            ilpAddress: ilpStreamConnection.ilpAddress,
            sharedSecret: base64url(ilpStreamConnection.sharedSecret)
          }
        ]
      }
    }

    return baseIncomingPayment
  }

  public toPublicOpenPaymentsType(): Pick<
    OpenPaymentsIncomingPayment,
    'receivedAmount'
  > {
    return { receivedAmount: serializeAmount(this.receivedAmount) }
  }
}
