import { BaseModel } from './base'
import { IlpHttpToken } from './ilpHttpToken'
import { uuidToBigInt } from '../utils'
import { Model, Pojo, raw } from 'objection'

const BALANCE_IDS = [
  'balanceId',
  'trustlineBalanceId',
  'creditExtendedBalanceId',
  'borrowedBalanceId',
  'lentBalanceId'
]

function bigIntToUuid(id: bigint): Pojo {
  return raw('?::uuid', [id.toString(16).padStart(32, '0')])
}

export class IlpAccount extends BaseModel {
  public static get tableName(): string {
    return 'ilpAccounts'
  }

  static relationMappings = {
    subAccounts: {
      relation: Model.HasManyRelation,
      modelClass: IlpAccount,
      join: {
        from: 'ilpAccounts.id',
        to: 'ilpAccounts.superAccountId'
      }
    },
    superAccount: {
      relation: Model.HasOneRelation,
      modelClass: IlpAccount,
      join: {
        from: 'ilpAccounts.superAccountId',
        to: 'ilpAccounts.id'
      }
    },
    incomingTokens: {
      relation: Model.HasManyRelation,
      modelClass: IlpHttpToken,
      join: {
        from: 'ilpAccounts.id',
        to: 'ilpHttpTokens.accountId'
      }
    }
  }

  public readonly disabled!: boolean

  public readonly assetCode!: string
  public readonly assetScale!: number
  // TigerBeetle account id tracking Interledger balance
  public readonly balanceId!: bigint
  // TigerBeetle account id tracking credit extended by super-account
  public readonly trustlineBalanceId?: bigint
  // TigerBeetle account id tracking credit extended to sub-account(s)
  public readonly creditExtendedBalanceId?: bigint
  // TigerBeetle account id tracking amount loaned from super-account
  public readonly borrowedBalanceId?: bigint
  // TigerBeetle account id tracking amount(s) loaned to sub-account(s)
  public readonly lentBalanceId?: bigint

  public superAccountId?: string
  public subAccounts?: IlpAccount[]
  public superAccount?: IlpAccount

  public readonly maxPacketAmount!: bigint

  public readonly incomingTokens?: IlpHttpToken[]
  public readonly outgoingToken?: string
  public readonly outgoingEndpoint?: string

  public readonly streamEnabled!: boolean

  public readonly staticIlpAddress?: string

  $formatDatabaseJson(json: Pojo): Pojo {
    BALANCE_IDS.forEach((balanceId) => {
      if (json[balanceId]) {
        json[balanceId] = bigIntToUuid(json[balanceId])
      }
    })
    return super.$formatDatabaseJson(json)
  }

  $parseDatabaseJson(json: Pojo): Pojo {
    const formattedJson = super.$parseDatabaseJson(json)
    BALANCE_IDS.forEach((balanceId) => {
      if (formattedJson[balanceId]) {
        formattedJson[balanceId] = uuidToBigInt(json[balanceId])
      }
    })
    return formattedJson
  }
}
