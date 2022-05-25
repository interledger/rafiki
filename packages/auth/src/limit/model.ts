import { Model } from 'objection'
import { BaseModel } from '../shared/baseModel'
import { AccessToken } from '../accessToken/model'
import { Grant } from '../grant/model'

export enum LimitName {
  SendAmount = 'sendAmount',
  ReceiveAmount = 'receiveAmount',
  CreatedBy = 'createdBy'
}

const AMOUNT_LIMITS = [LimitName.SendAmount, LimitName.ReceiveAmount]

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

  static relationMappings = {
    accessToken: {
      relation: Model.HasOneRelation,
      modelClass: AccessToken,
      join: {
        from: 'limits.accessToken',
        to: 'accessTokens.value'
      }
    },
    grant: {
      relation: Model.HasOneRelation,
      modelClass: Grant,
      join: {
        from: 'limits.grantId',
        to: 'grants.id'
      }
    }
  }

  public id!: string
  public name!: LimitName
  public accessToken!: string
  public grantId!: string
  public value?: bigint
  public assetCode?: string
  public assetScale?: number
  public createdById?: string

  get data(): string | AmountData | undefined {
    if (this.name === LimitName.CreatedBy) {
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
