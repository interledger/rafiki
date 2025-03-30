import { v4 as uuid } from 'uuid'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../app'
import { WebhookEvent } from '../webhook/model'
import { EventPayload } from '../webhook/service'
import { createGrant } from './grant'

type WebhookEventPayload = EventPayload & { grantId: string }

export async function createWebhookEvent(
  deps: IocContract<AppServices>,
  overrides?: Partial<WebhookEventPayload>
): Promise<WebhookEvent> {
  const knex = await deps.use('knex')
  const grant = await createGrant(deps)
  const newEvent = {
    id: uuid(),
    grantId: grant.id,
    type: 'grant.revoked',
    data: { id: grant.id, revokedAt: new Date().toISOString() },
    ...overrides
  }
  return await WebhookEvent.query(knex).insertAndFetch(newEvent)
}
