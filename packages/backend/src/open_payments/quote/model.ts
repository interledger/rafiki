import { Model, Pojo } from 'objection'
import * as Pay from '@interledger/pay'

import { Amount, serializeAmount } from '../amount'
import {
  WalletAddress,
  WalletAddressSubresource
} from '../wallet_address/model'
import { Asset } from '../../asset/model'
import { Quote as OpenPaymentsQuote } from '@interledger/open-payments'
import { Fee } from '../../fee/model'
import { BaseModel } from '../../shared/baseModel'

// TODO: use or lose. could maybe be used as a typegaurd instead of checking that details
// field(s) are present
// export interface QuoteWithDetails extends Quote {
//   ilpQuoteDetails: IlpQuoteDetails
// }

export class Quote extends WalletAddressSubresource {
  public static readonly tableName = 'quotes'
  public static readonly urlPath = '/quotes'

  static get virtualAttributes(): string[] {
    return ['debitAmount', 'receiveAmount', 'method']
  }

  // Asset id of the sender
  public assetId!: string
  public asset!: Asset

  public estimatedExchangeRate!: number
  public feeId?: string
  public fee?: Fee

  public ilpQuoteDetails?: IlpQuoteDetails
  public sourceAmount?: bigint

  static get relationMappings() {
    return {
      ...super.relationMappings,
      asset: {
        relation: Model.HasOneRelation,
        modelClass: Asset,
        join: {
          from: 'quotes.assetId',
          to: 'assets.id'
        }
      },
      fee: {
        relation: Model.HasOneRelation,
        modelClass: Fee,
        join: {
          from: 'quotes.feeId',
          to: 'fees.id'
        }
      },
      ilpQuoteDetails: {
        relation: Model.HasOneRelation,
        modelClass: IlpQuoteDetails,
        join: {
          from: 'ilpQuoteDetails.quoteId',
          to: 'quotes.id'
        }
      }
    }
  }

  public expiresAt!: Date

  public receiver!: string

  private debitAmountValue!: bigint

  public getUrl(walletAddress: WalletAddress): string {
    const url = new URL(walletAddress.url)
    return `${url.origin}${Quote.urlPath}/${this.id}`
  }

  public get debitAmount(): Amount {
    return {
      value: this.debitAmountValue,
      assetCode: this.asset.code,
      assetScale: this.asset.scale
    }
  }

  public set debitAmount(amount: Amount) {
    this.debitAmountValue = amount.value
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

  public get maxSourceAmount(): bigint {
    return this.debitAmountValue
  }

  public get minDeliveryAmount(): bigint {
    return this.receiveAmountValue
  }

  public get method(): 'ilp' {
    return 'ilp'
  }

  $formatJson(json: Pojo): Pojo {
    json = super.$formatJson(json)
    return {
      id: json.id,
      walletAddressId: json.walletAddressId,
      receiver: json.receiver,
      debitAmount: {
        ...json.debitAmount,
        value: json.debitAmount.value.toString()
      },
      receiveAmount: {
        ...json.receiveAmount,
        value: json.receiveAmount.value.toString()
      },
      createdAt: json.createdAt,
      expiresAt: json.expiresAt.toISOString()
    }
  }

  public toOpenPaymentsType(walletAddress: WalletAddress): OpenPaymentsQuote {
    return {
      id: this.getUrl(walletAddress),
      walletAddress: walletAddress.url,
      receiveAmount: serializeAmount(this.receiveAmount),
      debitAmount: serializeAmount(this.debitAmount),
      receiver: this.receiver,
      expiresAt: this.expiresAt.toISOString(),
      createdAt: this.createdAt.toISOString(),
      method: this.method
    }
  }
}

export class IlpQuoteDetails extends BaseModel {
  public static readonly tableName = 'ilpQuoteDetails'

  static get virtualAttributes(): string[] {
    return [
      'minExchangeRate',
      'lowEstimatedExchangeRate',
      'highEstimatedExchangeRate'
    ]
  }

  public quoteId!: string
  public quote?: Quote

  public maxPacketAmount!: bigint
  public minExchangeRateNumerator!: bigint
  public minExchangeRateDenominator!: bigint
  public lowEstimatedExchangeRateNumerator!: bigint
  public lowEstimatedExchangeRateDenominator!: bigint
  public highEstimatedExchangeRateNumerator!: bigint
  public highEstimatedExchangeRateDenominator!: bigint

  static get relationMappings() {
    return {
      quote: {
        relation: Model.BelongsToOneRelation,
        modelClass: Quote,
        join: {
          from: 'ilpQuoteDetails.quoteId',
          to: 'quotes.id'
        }
      }
    }
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
    if (!highEstimatedExchangeRate.isPositive()) {
      throw new Error('high estimated exchange rate is not positive')
    }
    return highEstimatedExchangeRate
  }

  public set highEstimatedExchangeRate(value: Pay.PositiveRatio) {
    this.highEstimatedExchangeRateNumerator = value.a.value
    this.highEstimatedExchangeRateDenominator = value.b.value
  }
}
