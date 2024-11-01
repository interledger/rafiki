import { BaseModel } from '../../../shared/baseModel'
import * as Pay from '@interledger/pay'

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

  public maxPacketAmount!: bigint
  public minExchangeRateNumerator!: bigint
  public minExchangeRateDenominator!: bigint
  public lowEstimatedExchangeRateNumerator!: bigint
  public lowEstimatedExchangeRateDenominator!: bigint
  public highEstimatedExchangeRateNumerator!: bigint
  public highEstimatedExchangeRateDenominator!: bigint

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
