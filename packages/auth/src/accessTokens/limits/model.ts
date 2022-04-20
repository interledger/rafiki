import { BaseModel } from '../../shared/baseModel'

enum LimitNames {
  SendAmount = 'sendAmount',
  ReceiveAmount = 'receiveAmount',
  CreatedBy = 'createdBy'
}

const AMOUNT_LIMITS = [LimitNames.SendAmount, LimitNames.ReceiveAmount]

interface AmountData {
  assetCode?: string
  assetScale?: number
}

export class Limit extends BaseModel {
  public static get tableName(): string {
    return 'limits'
  }

  static get virtualAttributes(): string[] {
    return ['data']
  }

  public name!: LimitNames
  public value?: bigint
  public assetCode?: string
  public assetScale?: number
  public createdById?: string

  get data(): string | AmountData | undefined {
    if (this.name === LimitNames.CreatedBy) {
      return this.createdById
    } else if (AMOUNT_LIMITS.includes(this.name)) {
      return {
        assetScale: this.assetScale,
        assetCode: this.assetCode
      }
    } else {
      throw new Error('unknown limit name')
    }
  }
}
