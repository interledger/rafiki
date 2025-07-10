import { join } from 'path'

import { BaseModel } from '../shared/baseModel'
import { WebhookEvent } from './event/model'
import { Tenant } from '../tenants/model'

export class Webhook extends BaseModel {
  public static get tableName(): string {
    return 'webhooks'
  }

  static relationMappings = () => ({
    event: {
      relation: BaseModel.BelongsToOneRelation,
      modelClass: join(__dirname, './event/model'),
      join: {
        from: 'webhooks.eventId',
        to: 'webhookEvents.id'
      }
    },
    tenant: {
      relation: BaseModel.BelongsToOneRelation,
      modelClass: join(__dirname, '../../tenants/model'),
      join: {
        from: 'webhooks.recipientTenantId',
        to: 'tenants.id'
      }
    }
  })

  public eventId!: string
  public attempts!: number
  public statusCode?: number
  public processAt!: Date | null
  public recipientTenantId!: string

  public event?: WebhookEvent
  public tenant?: Tenant
}

export interface WebhookWithEvent extends Webhook {
  event: NonNullable<Webhook['event']>
}

export function isWebhookWithEvent(
  webhook: Webhook
): webhook is WebhookWithEvent {
  return !!webhook.event
}
