import { BaseModel } from './base'
import { Token } from './token'
import { uuidToBigInt } from '../utils'
import { Model, Pojo, raw } from 'objection'

export class IlpAccount extends BaseModel {
  public static get tableName(): string {
    return 'ilpAccounts'
  }

  static relationMappings = {
    incomingTokens: {
      relation: Model.HasManyRelation,
      modelClass: Token,
      join: {
        from: 'ilpAccounts.id',
        to: 'tokens.accountId'
      }
    }
  }

  public readonly disabled!: boolean

  public readonly assetCode!: string
  public readonly assetScale!: number
  public readonly balanceId!: bigint
  // public debtBalanceId!: string
  // public trustlineBalanceId!: string
  // public loanBalanceId?: string
  // public creditBalanceId?: string

  // public parentAccountId?: string

  public readonly maxPacketAmount!: bigint

  public readonly incomingTokens?: Token[]
  public readonly outgoingToken?: string
  public readonly outgoingEndpoint?: string

  public readonly streamEnabled!: boolean

  public readonly staticIlpAddress?: string

  $formatDatabaseJson(json: Pojo): Pojo {
    const balanceId: bigint = json.balanceId
    if (balanceId) {
      json.balanceId = raw('?::uuid', [
        balanceId.toString(16).padStart(32, '0')
      ])
    }

    return super.$formatDatabaseJson(json)
  }

  $parseDatabaseJson(json: Pojo): Pojo {
    const formattedJson = super.$parseDatabaseJson(json)
    if (formattedJson.balanceId) {
      formattedJson.balanceId = uuidToBigInt(json.balanceId)
    }

    return formattedJson
  }
}
