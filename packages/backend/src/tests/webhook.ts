import { faker } from '@faker-js/faker'
import { v4 as uuid } from 'uuid'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../app'
import { WebhookEvent } from '../webhook/event/model'
import { sample } from 'lodash'
import { EventPayload } from '../webhook/service'
import { createAsset } from './asset'

export const webhookEventTypes = ['event1', 'event2', 'event3'] as const
type WebhookEventPayload = EventPayload & { assetId: string } & {
  tenantId: string
}

export async function createWebhookEvent(
  deps: IocContract<AppServices>,
  overrides?: Partial<WebhookEventPayload>
): Promise<WebhookEvent> {
  const knex = await deps.use('knex')
  const config = await deps.use('config')
  const asset = await createAsset(deps)
  const newEvent = {
    id: uuid(),
    assetId: asset.id,
    type: sample(webhookEventTypes) as string,
    data: { field1: faker.string.sample() },
    tenantId: config.operatorTenantId,
    ...overrides
  }
  return await WebhookEvent.query(knex).insert(newEvent)
}
