import { BaseModel } from './base'
import { Token } from './token'
import { Model } from 'objection'

export class IlpAccountSettings extends BaseModel {
  public static get tableName(): string {
    return 'ilpAccountSettings'
  }

  static relationMappings = {
    incomingTokens: {
      relation: Model.HasManyRelation,
      modelClass: Token,
      join: {
        from: 'ilpAccountSettings.id',
        to: 'tokens.ilpAccountSettingsId'
      }
    }
  }

  public disabled!: boolean

  public assetCode!: string
  public assetScale!: number
  public balanceId!: string
  public debtBalanceId!: string
  public trustlineBalanceId!: string
  public parentAccountId?: string

  public incomingTokens?: Token[]
  public incomingEndpoint?: string
  public outgoingToken?: string
  public outgoingEndpoint?: string

  public streamEnabled?: boolean

  public staticIlpAddress?: string // ILP address for this account
}
