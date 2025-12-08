import { Model, ModelOptions, QueryContext } from 'objection'
import { DbErrors } from 'objection-db-errors'
import { createDecipheriv } from 'node:crypto'

import { LiquidityAccount } from '../../../accounting/service'
import { Asset } from '../../../asset/model'
import { ConnectorAccount } from '../../../payment-method/ilp/connector/core/rafiki'
import {
  WalletAddressSubresource,
  WalletAddress
} from '../../wallet_address/model'
import { Quote } from '../../quote/model'
import { Amount, AmountJSON, serializeAmount } from '../../amount'
import { WebhookEvent } from '../../../webhook/event/model'
import {
  OutgoingPayment as OpenPaymentsOutgoingPayment,
  OutgoingPaymentWithSpentAmounts
} from '@interledger/open-payments'
import { Tenant } from '../../../tenants/model'
import {
  OutgoingPaymentCardDetails,
  outgoingPaymentCardDetailsRelation
} from './card/model'

export class OutgoingPaymentGrant extends DbErrors(Model) {
  public static get modelPaths(): string[] {
    return [__dirname]
  }
  public static readonly tableName = 'outgoingPaymentGrants'
  public id!: string
}

export class OutgoingPayment
  extends WalletAddressSubresource
  implements ConnectorAccount, LiquidityAccount
{
  public static readonly tableName = 'outgoingPayments'
  public static readonly urlPath = '/outgoing-payments'

  static get virtualAttributes(): string[] {
    return [
      'debitAmount',
      'receiveAmount',
      'quote',
      'sentAmount',
      'receiver',
      'grantSpentDebitAmount',
      'grantSpentReceiveAmount'
    ]
  }

  public state!: OutgoingPaymentState
  // The "| null" is necessary so that `$beforeUpdate` can modify a patch to remove the error. If `$beforeUpdate` set `error = undefined`, the patch would ignore the modification.
  public error?: string | null
  public stateAttempts!: number

  public grantId?: string

  public get receiver(): string {
    return this.quote.receiver
  }

  public get debitAmount(): Amount {
    return this.quote.debitAmount
  }

  private sentAmountValue?: bigint

  public get sentAmount(): Amount {
    return {
      value: this.sentAmountValue || BigInt(0),
      assetCode: this.asset.code,
      assetScale: this.asset.scale
    }
  }
  public set sentAmount(amount: Amount) {
    this.sentAmountValue = amount.value
  }
  public get receiveAmount(): Amount {
    return this.quote.receiveAmount
  }

  private grantSpentReceiveAmountValue?: bigint
  public get grantSpentReceiveAmount(): Amount {
    return {
      value: this.grantSpentReceiveAmountValue || BigInt(0),
      assetCode: this.receiveAmount.assetCode,
      assetScale: this.receiveAmount.assetScale
    }
  }
  public set grantSpentReceiveAmount(amount: Amount) {
    this.grantSpentReceiveAmountValue = amount.value
  }

  private grantSpentDebitAmountValue?: bigint
  public get grantSpentDebitAmount(): Amount {
    return {
      value: this.grantSpentDebitAmountValue || BigInt(0),
      assetCode: this.debitAmount.assetCode,
      assetScale: this.debitAmount.assetScale
    }
  }
  public set grantSpentDebitAmount(amount: Amount) {
    this.grantSpentDebitAmountValue = amount.value
  }

  public metadata?: Record<string, unknown>

  public cardDetails?: OutgoingPaymentCardDetails

  public initiatedBy!: OutgoingPaymentInitiationReason

  public quote!: Quote

  public get assetId(): string {
    return this.quote.assetId
  }

  public getUrl(resourceServerUrl: string): string {
    resourceServerUrl = resourceServerUrl.replace(/\/+$/, '')
    return `${resourceServerUrl}/${this.tenantId}${OutgoingPayment.urlPath}/${this.id}`
  }

  public get asset(): Asset {
    return this.quote.asset
  }

  public get failed(): boolean {
    return [
      OutgoingPaymentState.Cancelled,
      OutgoingPaymentState.Failed
    ].includes(this.state)
  }

  public tenantId!: string

  public senderData?: string
  public getSenderData(key?: string): string | null {
    if (!this.senderData) return null
    if (!key) return this.senderData
    const { tag, cipherText, iv } = JSON.parse(this.senderData)

    const decipher = createDecipheriv(
      'aes-256-gcm',
      Uint8Array.from(Buffer.from(key, 'base64')),
      iv
    )
    decipher.setAuthTag(Uint8Array.from(Buffer.from(tag, 'base64')))
    let decryptedDataToTransmit = decipher.update(cipherText, 'base64', 'utf8')
    decryptedDataToTransmit += decipher.final('utf8')

    return decryptedDataToTransmit
  }

  static get relationMappings() {
    return {
      ...super.relationMappings,
      quote: {
        relation: Model.HasOneRelation,
        modelClass: Quote,
        join: {
          from: 'outgoingPayments.id',
          to: 'quotes.id'
        }
      },
      tenant: {
        relation: Model.BelongsToOneRelation,
        modelClass: Tenant,
        join: {
          from: 'outgoingPayments.tenantId',
          to: 'tenants.id'
        }
      },
      cardDetails: {
        relation: Model.HasOneRelation,
        modelClass: OutgoingPaymentCardDetails,
        join: {
          from: 'outgoingPayments.id',
          to: outgoingPaymentCardDetailsRelation
        }
      }
    }
  }

  $beforeUpdate(opts: ModelOptions, queryContext: QueryContext): void {
    super.$beforeUpdate(opts, queryContext)
    if (opts.old && this.state) {
      if (!this.stateAttempts) {
        this.stateAttempts = 0
      }
    }
  }

  public toData({
    amountSent,
    balance
  }: {
    amountSent: bigint
    balance: bigint
  }): PaymentData {
    const data: PaymentData = {
      id: this.id,
      walletAddressId: this.walletAddressId,
      client: this.client,
      state: this.state,
      receiver: this.receiver,
      debitAmount: {
        ...this.debitAmount,
        value: this.debitAmount.value.toString()
      },
      receiveAmount: {
        ...this.receiveAmount,
        value: this.receiveAmount.value.toString()
      },
      sentAmount: {
        ...this.debitAmount,
        value: amountSent.toString()
      },
      stateAttempts: this.stateAttempts,
      createdAt: new Date(+this.createdAt).toISOString(),
      balance: balance.toString()
    }
    if (this.metadata) {
      data.metadata = this.metadata
    }
    if (this.error) {
      data.error = this.error
    }

    if (this.grantId) {
      data.grantId = this.grantId
    }
    if (this.cardDetails) {
      data.cardDetails = {
        requestId: this.cardDetails.requestId,
        data: this.cardDetails.data,
        initiatedAt: this.cardDetails.initiatedAt
      }
    }
    return data
  }

  public toOpenPaymentsType(
    resourceServerUrl: string,
    walletAddress: WalletAddress
  ): OpenPaymentsOutgoingPayment {
    return {
      id: this.getUrl(resourceServerUrl),
      walletAddress: walletAddress.address,
      quoteId: this.quote?.getUrl(resourceServerUrl) ?? undefined,
      receiveAmount: serializeAmount(this.receiveAmount),
      debitAmount: serializeAmount(this.debitAmount),
      sentAmount: serializeAmount(this.sentAmount),
      receiver: this.receiver,
      failed: this.failed,
      metadata: this.metadata ?? undefined,
      createdAt: this.createdAt.toISOString()
    }
  }

  public toOpenPaymentsWithSpentAmountsType(
    resourceServerUrl: string,
    walletAddress: WalletAddress
  ): OutgoingPaymentWithSpentAmounts {
    return {
      ...this.toOpenPaymentsType(resourceServerUrl, walletAddress),
      grantSpentReceiveAmount: serializeAmount(this.grantSpentReceiveAmount),
      grantSpentDebitAmount: serializeAmount(this.grantSpentDebitAmount)
    }
  }
}

export enum OutgoingPaymentState {
  // Initial state.
  // Awaiting money from the user's wallet account to be deposited to the payment account to reserve it for the payment.
  // On success, transition to `SENDING`.
  // On failure, transition to `FAILED`.
  // Can also go to CANCELLED state if cancelOutgoingPayment mutation is called
  Funding = 'FUNDING',
  // Pay from the account to the destination.
  // On success, transition to `COMPLETED`.
  Sending = 'SENDING',
  // The payment failed. (Though some money may have been delivered).
  Failed = 'FAILED',
  // Successful completion.
  Completed = 'COMPLETED',
  // Transaction has been cancelled by ASE
  Cancelled = 'CANCELLED'
}

export enum OutgoingPaymentDepositType {
  PaymentCreated = 'outgoing_payment.created'
}

export enum OutgoingPaymentWithdrawType {
  PaymentFailed = 'outgoing_payment.failed',
  PaymentCompleted = 'outgoing_payment.completed'
}

// Events that reflect status changes but do not directly drive deposit/withdraw flows
export enum OutgoingPaymentStatusType {
  PaymentFunded = 'outgoing_payment.funded',
  PaymentCancelled = 'outgoing_payment.cancelled'
}

export const enum OutgoingPaymentInitiationReason {
  // The outgoing payment was initiated by a card payment.
  Card = 'CARD',
  // The outgoing payment was initiated through Open Payments.
  OpenPayments = 'OPEN_PAYMENTS',
  // The outgoing payment was initiated by the Admin API.
  Admin = 'ADMIN'
}

export const OutgoingPaymentEventType = {
  ...OutgoingPaymentDepositType,
  ...OutgoingPaymentWithdrawType,
  ...OutgoingPaymentStatusType
}
export type OutgoingPaymentEventType =
  | OutgoingPaymentDepositType
  | OutgoingPaymentWithdrawType
  | OutgoingPaymentStatusType

export interface OutgoingPaymentResponse {
  id: string
  walletAddressId: string
  client?: string
  createdAt: string
  receiver: string
  debitAmount: AmountJSON
  receiveAmount: AmountJSON
  metadata?: Record<string, unknown>
  failed: boolean
  sentAmount: AmountJSON
}

export type PaymentData = Omit<OutgoingPaymentResponse, 'failed'> & {
  error?: string
  state: OutgoingPaymentState
  stateAttempts: number
  balance: string
  grantId?: string
  cardDetails?: Pick<
    OutgoingPaymentCardDetails,
    'requestId' | 'data' | 'initiatedAt'
  >
}

export const isOutgoingPaymentEventType = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  o: any
): o is OutgoingPaymentEventType =>
  Object.values(OutgoingPaymentEventType).includes(o)

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isOutgoingPaymentEvent = (o: any): o is OutgoingPaymentEvent =>
  o instanceof WebhookEvent && isOutgoingPaymentEventType(o.type)

export enum OutgoingPaymentEventError {
  OutgoingPaymentIdRequired = 'Outgoing Payment ID is required for outgoing payment events'
}

export class OutgoingPaymentEvent extends WebhookEvent {
  public type!: OutgoingPaymentEventType
  public data!: PaymentData

  public $beforeInsert(context: QueryContext): void {
    super.$beforeInsert(context)

    if (!this.outgoingPaymentId) {
      throw new Error(OutgoingPaymentEventError.OutgoingPaymentIdRequired)
    }
  }
}
