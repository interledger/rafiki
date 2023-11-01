import { Pojo } from 'objection'

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
  public processAt!: Date | null

  public withdrawal?: {
    accountId: string
    assetId: string
    amount: bigint
  }

  $formatDatabaseJson(json: Pojo): Pojo {
    // transforms WebhookEvent.withdrawal to db fields. eg. withdrawal.accountId => withdrawalAccountId
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
    // transforms withdrawal db fields to WebhookEvent.withdrawal. eg. withdrawalAccountId => withdrawal.accountId
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
