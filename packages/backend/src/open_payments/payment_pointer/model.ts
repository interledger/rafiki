import { Model, Page } from 'objection'
import { PaymentPointer as OpenPaymentsPaymentPointer } from '@interledger/open-payments'
import { LiquidityAccount, OnCreditOptions } from '../../accounting/service'
import { ConnectorAccount } from '../../connector/core/rafiki'
import { Asset } from '../../asset/model'
import { BaseModel, Pagination } from '../../shared/baseModel'
import { WebhookEvent } from '../../webhook/model'
import { PaymentPointerKey } from '../../open_payments/payment_pointer/key/model'

export class PaymentPointer
  extends BaseModel
  implements ConnectorAccount, LiquidityAccount
{
  public static get tableName(): string {
    return 'paymentPointers'
  }

  static relationMappings = () => ({
    asset: {
      relation: Model.HasOneRelation,
      modelClass: Asset,
      join: {
        from: 'paymentPointers.assetId',
        to: 'assets.id'
      }
    },
    keys: {
      relation: Model.HasManyRelation,
      modelClass: PaymentPointerKey,
      join: {
        from: 'paymentPointers.id',
        to: 'paymentPointerKeys.paymentPointerId'
      }
    }
  })

  public keys?: PaymentPointerKey[]

  public url!: string
  public publicName?: string

  public readonly assetId!: string
  public asset!: Asset

  // The cumulative received amount tracked by
  // `payment_pointer.web_monetization` webhook events.
  // The value should be equivalent to the following query:
  // select sum(`withdrawalAmount`) from `webhookEvents` where `withdrawalAccountId` = `paymentPointer.id`
  public totalEventsAmount!: bigint
  public processAt!: Date | null

  public async onCredit({
    totalReceived,
    withdrawalThrottleDelay
  }: OnCreditOptions): Promise<PaymentPointer> {
    if (this.asset.withdrawalThreshold !== null) {
      const paymentPointer = await PaymentPointer.query()
        .patchAndFetchById(this.id, {
          processAt: new Date()
        })
        .whereRaw('?? <= ?', [
          'totalEventsAmount',
          totalReceived - this.asset.withdrawalThreshold
        ])
        .withGraphFetched('asset')
      if (paymentPointer) {
        return paymentPointer
      }
    }
    if (withdrawalThrottleDelay !== undefined && !this.processAt) {
      await this.$query().patch({
        processAt: new Date(Date.now() + withdrawalThrottleDelay)
      })
    }
    return this
  }

  public toData(received: bigint): PaymentPointerData {
    return {
      paymentPointer: {
        id: this.id,
        createdAt: new Date(+this.createdAt).toISOString(),
        received: received.toString()
      }
    }
  }

  public toOpenPaymentsType({
    authServer
  }: {
    authServer: string
  }): OpenPaymentsPaymentPointer {
    return {
      id: this.url,
      publicName: this.publicName,
      assetCode: this.asset.code,
      assetScale: this.asset.scale,
      authServer
    }
  }
}

export enum PaymentPointerEventType {
  PaymentPointerWebMonetization = 'payment_pointer.web_monetization'
}

export type PaymentPointerData = {
  paymentPointer: {
    id: string
    createdAt: string
    received: string
  }
}

export class PaymentPointerEvent extends WebhookEvent {
  public type!: PaymentPointerEventType
  public data!: PaymentPointerData
}

export interface GetOptions {
  id: string
  client?: string
  paymentPointerId?: string
}

export interface ListOptions {
  paymentPointerId: string
  client?: string
  pagination?: Pagination
}

class SubresourceQueryBuilder<
  M extends Model,
  R = M[]
> extends BaseModel.QueryBuilder<M, R> {
  ArrayQueryBuilderType!: SubresourceQueryBuilder<M, M[]>
  SingleQueryBuilderType!: SubresourceQueryBuilder<M, M>
  MaybeSingleQueryBuilderType!: SubresourceQueryBuilder<M, M | undefined>
  NumberQueryBuilderType!: SubresourceQueryBuilder<M, number>
  PageQueryBuilderType!: SubresourceQueryBuilder<M, Page<M>>

  get({ id, paymentPointerId, client }: GetOptions) {
    if (paymentPointerId) {
      this.where(
        `${this.modelClass().tableName}.paymentPointerId`,
        paymentPointerId
      )
    }
    if (client) {
      this.where({ client })
    }
    return this.findById(id)
  }
  list({ paymentPointerId, client, pagination }: ListOptions) {
    if (client) {
      this.where({ client })
    }
    return this.getPage(pagination).where(
      `${this.modelClass().tableName}.paymentPointerId`,
      paymentPointerId
    )
  }
}

export abstract class PaymentPointerSubresource extends BaseModel {
  public static readonly urlPath: string

  public readonly paymentPointerId!: string
  public paymentPointer?: PaymentPointer

  public abstract readonly assetId: string
  public abstract asset: Asset

  public readonly client?: string

  static get relationMappings() {
    return {
      paymentPointer: {
        relation: Model.BelongsToOneRelation,
        modelClass: PaymentPointer,
        join: {
          from: `${this.tableName}.paymentPointerId`,
          to: 'paymentPointers.id'
        }
      }
    }
  }

  QueryBuilderType!: SubresourceQueryBuilder<this>
  static QueryBuilder = SubresourceQueryBuilder
}
