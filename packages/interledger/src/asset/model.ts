import { BaseModel } from '../shared/baseModel'
import { AnyQueryBuilder, Pojo } from 'objection'
import { bigIntToDbUuid, uuidToBigInt } from '../shared/utils'

export class Asset extends BaseModel {
  public static get tableName(): string {
    return 'assets'
  }

  static modifiers = {
    codeAndScale(query: AnyQueryBuilder): void {
      query.select('code', 'scale')
    },
    withSettleId(query: AnyQueryBuilder): void {
      query.select('code', 'scale', 'settlementBalanceId')
    },
    withUnit(query: AnyQueryBuilder): void {
      query.select('code', 'scale', 'unit')
    }
  }

  public readonly code!: string
  public readonly scale!: number

  // TigerBeetle account 2 byte unit field representing account's asset
  public readonly unit!: number

  // TigerBeetle account id tracking settlement account balance
  public readonly settlementBalanceId!: bigint
  // TigerBeetle account id tracking liquidity account balance
  public readonly liquidityBalanceId!: bigint

  $formatDatabaseJson(json: Pojo): Pojo {
    if (json.settlementBalanceId) {
      json.settlementBalanceId = bigIntToDbUuid(json.settlementBalanceId)
    }
    if (json.liquidityBalanceId) {
      json.liquidityBalanceId = bigIntToDbUuid(json.liquidityBalanceId)
    }
    return super.$formatDatabaseJson(json)
  }

  $parseDatabaseJson(json: Pojo): Pojo {
    const formattedJson = super.$parseDatabaseJson(json)
    if (formattedJson.settlementBalanceId) {
      formattedJson.settlementBalanceId = uuidToBigInt(
        formattedJson.settlementBalanceId
      )
    }
    if (formattedJson.liquidityBalanceId) {
      formattedJson.liquidityBalanceId = uuidToBigInt(
        formattedJson.liquidityBalanceId
      )
    }
    return formattedJson
  }
}
