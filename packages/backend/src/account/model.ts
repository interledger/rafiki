import { BaseModel } from '../shared/baseModel'
import { Asset } from '../asset/model'
import { Model, Pojo } from 'objection'

export class Account extends BaseModel {
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
    }
  }

  public readonly disabled!: boolean

  public readonly assetId!: string
  public asset!: Asset
  // TigerBeetle account id tracking Interledger balance
  public readonly balanceId!: string
  // TigerBeetle account id tracking amount sent
  public readonly sentBalanceId?: string

  public readonly stream!: {
    enabled: boolean
  }

  $formatDatabaseJson(json: Pojo): Pojo {
    if (json.stream) {
      json.streamEnabled = json.stream.enabled
      delete json.stream
    }
    return super.$formatDatabaseJson(json)
  }

  $parseDatabaseJson(json: Pojo): Pojo {
    const formattedJson = super.$parseDatabaseJson(json)
    if (formattedJson.streamEnabled !== null) {
      formattedJson.stream = {
        enabled: formattedJson.streamEnabled
      }
      delete formattedJson.streamEnabled
    }
    return formattedJson
  }
}
