import { BaseModel } from './base'
import { Token } from './token'
import { Model } from 'objection'

export class Account extends BaseModel {
  public static get tableName(): string {
    return 'accounts'
  }

  static relationMappings = {
    incomingTokens: {
      relation: Model.HasManyRelation,
      modelClass: Token,
      join: {
        from: 'accounts.id',
        to: 'tokens.accountId'
      }
    }
  }

  public disabled!: boolean

  public assetCode!: string
  public assetScale!: number
  public balanceId!: string
  public debtBalanceId!: string
  public trustlineBalanceId!: string
  public loanBalanceId?: string
  public creditBalanceId?: string

  public parentAccountId?: string

  public maxPacketAmount!: bigint

  public incomingTokens?: Token[]
  public outgoingToken?: string
  public outgoingEndpoint?: string

  public streamEnabled!: boolean

  public staticIlpAddress?: string
}
