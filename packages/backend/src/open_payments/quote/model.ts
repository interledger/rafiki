import assert from 'assert'
import { Model, Pojo } from 'objection'
import * as Pay from '@interledger/pay'

import { Amount, AmountJSON } from '../amount'
import { Account } from '../account/model'
import { Asset } from '../../asset/model'
import { BaseModel } from '../../shared/baseModel'

export class Quote extends BaseModel {
  public static readonly tableName = 'quotes'

  static get virtualAttributes(): string[] {
    return [
      'sendAmount',
      'receiveAmount',
      'minExchangeRate',
      'lowEstimatedExchangeRate',
      'highEstimatedExchangeRate'
    ]
  }

  // Open payments account id of the sender
  public accountId!: string
  public account?: Account

  // Asset id of the sender
  public assetId!: string
  public asset!: Asset

  static relationMappings = {
    account: {
      relation: Model.HasOneRelation,
      modelClass: Account,
      join: {
        from: 'quotes.accountId',
        to: 'accounts.id'
      }
    },
    asset: {
      relation: Model.HasOneRelation,
      modelClass: Asset,
      join: {
        from: 'quotes.assetId',
        to: 'assets.id'
      }
    }
  }

  public expiresAt!: Date

  public receiver!: string

  private sendAmountValue!: bigint

  public get sendAmount(): Amount {
    return {
      value: this.sendAmountValue,
      assetCode: this.asset.code,
      assetScale: this.asset.scale
    }
  }

  public set sendAmount(amount: Amount) {
    this.sendAmountValue = amount.value
  }

  private receiveAmountValue!: bigint
  private receiveAmountAssetCode!: string
  private receiveAmountAssetScale!: number

  public get receiveAmount(): Amount {
    return {
      value: this.receiveAmountValue,
      assetCode: this.receiveAmountAssetCode,
      assetScale: this.receiveAmountAssetScale
    }
  }

  public set receiveAmount(amount: Amount) {
    this.receiveAmountValue = amount.value
    this.receiveAmountAssetCode = amount.assetCode
    this.receiveAmountAssetScale = amount?.assetScale
  }

  public maxPacketAmount!: bigint
  private minExchangeRateNumerator!: bigint
  private minExchangeRateDenominator!: bigint
  private lowEstimatedExchangeRateNumerator!: bigint
  private lowEstimatedExchangeRateDenominator!: bigint
  private highEstimatedExchangeRateNumerator!: bigint
  private highEstimatedExchangeRateDenominator!: bigint

  public get maxSourceAmount(): bigint {
    return this.sendAmountValue
  }

  public get minDeliveryAmount(): bigint {
    return this.receiveAmountValue
  }

  public get minExchangeRate(): Pay.Ratio {
    return Pay.Ratio.of(
      Pay.Int.from(this.minExchangeRateNumerator) as Pay.PositiveInt,
      Pay.Int.from(this.minExchangeRateDenominator) as Pay.PositiveInt
    )
  }

  public set minExchangeRate(value: Pay.Ratio) {
    this.minExchangeRateNumerator = value.a.value
    this.minExchangeRateDenominator = value.b.value
  }

  public get lowEstimatedExchangeRate(): Pay.Ratio {
    return Pay.Ratio.of(
      Pay.Int.from(this.lowEstimatedExchangeRateNumerator) as Pay.PositiveInt,
      Pay.Int.from(this.lowEstimatedExchangeRateDenominator) as Pay.PositiveInt
    )
  }

  public set lowEstimatedExchangeRate(value: Pay.Ratio) {
    this.lowEstimatedExchangeRateNumerator = value.a.value
    this.lowEstimatedExchangeRateDenominator = value.b.value
  }

  // Note that the upper exchange rate bound is *exclusive*.
  public get highEstimatedExchangeRate(): Pay.PositiveRatio {
    const highEstimatedExchangeRate = Pay.Ratio.of(
      Pay.Int.from(this.highEstimatedExchangeRateNumerator) as Pay.PositiveInt,
      Pay.Int.from(this.highEstimatedExchangeRateDenominator) as Pay.PositiveInt
    )
    assert.ok(highEstimatedExchangeRate.isPositive())
    return highEstimatedExchangeRate
  }

  public set highEstimatedExchangeRate(value: Pay.PositiveRatio) {
    this.highEstimatedExchangeRateNumerator = value.a.value
    this.highEstimatedExchangeRateDenominator = value.b.value
  }

  $formatJson(json: Pojo): Pojo {
    json = super.$formatJson(json)
    return {
      id: json.id,
      accountId: json.accountId,
      receiver: json.receiver,
      sendAmount: {
        ...json.sendAmount,
        value: json.sendAmount.value.toString()
      },
      receiveAmount: {
        ...json.receiveAmount,
        value: json.receiveAmount.value.toString()
      },
      createdAt: json.createdAt,
      expiresAt: json.expiresAt.toISOString()
    }
  }
}

export type QuoteJSON = {
  id: string
  accountId: string
  receiver: string
  sendAmount: AmountJSON
  receiveAmount: AmountJSON
  createdAt: string
  expiresAt: string
}
