import { BaseModel } from '../shared/baseModel'
import { join } from 'path'
import { Grant } from '../grant/model'

export class WebhookEvent extends BaseModel {
  public static get tableName(): string {
    return 'webhookEvents'
  }

  static relationMappings = () => ({
    grant: {
      relation: BaseModel.BelongsToOneRelation,
      modelClass: join(__dirname, '../grant/model'),
      join: {
        from: 'webhookEvents.grantId',
        to: 'grants.id'
      }
    }
  })

  public type!: string
  public data!: Record<string, unknown>
  public attempts!: number
  public statusCode?: number
  public processAt!: Date | null

  public readonly grantId?: string

  public grant?: Grant
}
