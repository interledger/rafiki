import { Model, Pojo } from 'objection'

import { Asset } from '../asset/model'
import { BaseModel } from '../shared/baseModel'

const fieldPrefixes = ['withdrawal']

export class WebhookEvent extends BaseModel {
  public static get tableName(): string {
    return 'webhookEvents'
  }

  public type!: string
  public data!: Record<string, unknown>
  public attempts!: number
  public statusCode?: number
  public processAt!: Date

  public withdrawal?: {
    accountId: string
    assetId: string
    amount: bigint
  }

  static relationMappings = {
    withdrawalAsset: {
      relation: Model.HasOneRelation,
      modelClass: Asset,
      join: {
        from: 'webhookEvents.withdrawalAssetId',
        to: 'assets.id'
      }
    }
  }

  $formatDatabaseJson(json: Pojo): Pojo {
    for (const prefix of fieldPrefixes) {
      if (!json[prefix]) continue
      for (const key in json[prefix]) {
        json[prefix + key.charAt(0).toUpperCase() + key.slice(1)] =
          json[prefix][key]
      }
      delete json[prefix]
    }
    return super.$formatDatabaseJson(json)
  }

  $parseDatabaseJson(json: Pojo): Pojo {
    json = super.$parseDatabaseJson(json)
    for (const key in json) {
      const prefix = fieldPrefixes.find((prefix) => key.startsWith(prefix))
      if (!prefix) continue
      if (json[key] !== null) {
        if (!json[prefix]) json[prefix] = {}
        json[prefix][
          key.charAt(prefix.length).toLowerCase() + key.slice(prefix.length + 1)
        ] = json[key]
      }
      delete json[key]
    }
    return json
  }
}
