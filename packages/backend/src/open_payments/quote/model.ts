import { Model, Pojo } from 'objection'
import { Amount } from '../amount'
import { WalletAddressSubresource } from '../wallet_address/model'
import { Asset } from '../../asset/model'
import { Fee } from '../../fee/model'

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

  public debitAmountMinusFees?: bigint

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
      }
    }
  }

  public expiresAt!: Date

  public receiver!: string

  private debitAmountValue!: bigint

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
}
