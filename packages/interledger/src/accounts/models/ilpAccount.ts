import { BaseModel } from '../../shared/baseModel'
import { Asset } from './asset'
import { IlpHttpToken } from './ilpHttpToken'
import { bigIntToDbUuid, uuidToBigInt } from '../utils'
import { Model, Pojo } from 'objection'

const BALANCE_IDS = [
  'balanceId',
  'creditBalanceId',
  'creditExtendedBalanceId',
  'debtBalanceId',
  'lentBalanceId'
]

export class IlpAccount extends BaseModel {
  public static get tableName(): string {
    return 'accounts'
  }

  static relationMappings = {
    asset: {
      relation: Model.HasOneRelation,
      modelClass: Asset,
      join: {
        from: 'accounts.assetId',
        to: 'assets.id'
      }
    },
    subAccounts: {
      relation: Model.HasManyRelation,
      modelClass: IlpAccount,
      join: {
        from: 'accounts.id',
        to: 'accounts.superAccountId'
      }
    },
    superAccount: {
      relation: Model.HasOneRelation,
      modelClass: IlpAccount,
      join: {
        from: 'accounts.superAccountId',
        to: 'accounts.id'
      }
    },
    incomingTokens: {
      relation: Model.HasManyRelation,
      modelClass: IlpHttpToken,
      join: {
        from: 'accounts.id',
        to: 'ilpHttpTokens.accountId'
      }
    }
  }

  public readonly disabled!: boolean

  public readonly assetId!: string
  public asset!: Asset
  // TigerBeetle account id tracking Interledger balance
  public readonly balanceId!: bigint
  // TigerBeetle account id tracking credit extended by super-account
  public readonly creditBalanceId?: bigint
  // TigerBeetle account id tracking credit extended to sub-account(s)
  public readonly creditExtendedBalanceId?: bigint
  // TigerBeetle account id tracking amount loaned from super-account
  public readonly debtBalanceId?: bigint
  // TigerBeetle account id tracking amount(s) loaned to sub-account(s)
  public readonly lentBalanceId?: bigint

  public readonly superAccountId?: string
  public readonly subAccounts?: IlpAccount[]
  public readonly superAccount?: IlpAccount

  public readonly maxPacketAmount!: bigint

  public readonly incomingTokens?: IlpHttpToken[]
  public readonly outgoingToken?: string
  public readonly outgoingEndpoint?: string

  public readonly streamEnabled!: boolean

  public readonly staticIlpAddress?: string

  $formatDatabaseJson(json: Pojo): Pojo {
    BALANCE_IDS.forEach((balanceId) => {
      if (json[balanceId]) {
        json[balanceId] = bigIntToDbUuid(json[balanceId])
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

  public isSubAccount(): this is SubAccount {
    return !!this.superAccount
  }

  public hasSuperAccount(id: string): this is SubAccount {
    for (
      let account = this as IlpAccount;
      account.isSubAccount();
      account = account.superAccount
    ) {
      if (account.superAccount.id === id) {
        return true
      }
    }
    return false
  }
}

export interface SubAccount extends IlpAccount {
  superAccount: IlpAccount
}
