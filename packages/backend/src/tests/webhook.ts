import { faker } from '@faker-js/faker'
import { v4 as uuid } from 'uuid'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../app'
import { WebhookEvent, WebhookEventType } from '../webhook/model'
import { sample } from 'lodash'
import { EventPayload } from '../webhook/service'
import { createAsset } from './asset'

export const webhookEventTypes = [WebhookEventType.IncomingPaymentCreated, WebhookEventType.IncomingPaymentCompleted, WebhookEventType.IncomingPaymentExpired] as const
type WebhookEventPayload = EventPayload & { assetId: string }

export async function createWebhookEvent(
  deps: IocContract<AppServices>,
  overrides?: Partial<WebhookEventPayload>
): Promise<WebhookEvent> {
  const knex = await deps.use('knex')
  const asset = await createAsset(deps)
  const newEvent = {
    id: uuid(),
    assetId: asset.id,
    type: sample(webhookEventTypes),
    data: { field1: faker.string.sample() },
    ...overrides
  }
  return await WebhookEvent.query(knex).insert(newEvent)
}
