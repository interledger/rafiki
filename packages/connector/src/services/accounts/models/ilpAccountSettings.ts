import { BaseModel } from './base'

export class IlpAccountSettings extends BaseModel {
  public static get tableName(): string {
    return 'ilpAccountSettings'
  }

  public disabled!: boolean

  public assetCode!: string
  public assetScale!: number
  public balanceId!: string
  public parentAccountId?: string

  public incomingTokens?: string[]
  public incomingEndpoint?: string
  public outgoingToken?: string
  public outgoingEndpoint?: string

  public streamEnabled?: boolean
  public streamSuffix?: string // read-only; ILP suffix for STREAM server receiving

  public routingPrefixes?: string[] // prefixes that route to this account
  public ilpAddress?: string // ILP address for this account
}
