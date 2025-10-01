import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../app'
import { createTestApp, TestContainer } from '../tests/app'
import { initIocContainer } from '..'
import { Config } from '../config/app'
import {
  HandleWebhookContext,
  WebhookBody,
  WebhookHandlerRoutes
} from './routes'
import { truncateTables } from '../tests/tableManager'
import { createContext } from '../tests/context'
import { v4 } from 'uuid'
import { faker } from '@faker-js/faker'
import { webhookWaitMap } from './request-map'
import { Deferred } from '../utils/deferred'

describe('Webhook Handler Routes Tests', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let webhookHandlerRoutes: WebhookHandlerRoutes

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    webhookHandlerRoutes = await deps.use('webhookHandlerRoutes')
  })

  afterAll(async (): Promise<void> => {
    await truncateTables(deps)
    await appContainer.shutdown()
  })

  test('Can handle incoming payment completed webhook', async (): Promise<void> => {
    const incomingPaymentId = faker.internet.url()
    const ctx = createHandleWebhookContext({
      id: v4(),
      type: 'incoming_payment.completed',
      data: {
        id: incomingPaymentId,
        completed: true
      }
    })

    const deferred = new Deferred<WebhookBody>()
    const deferredSpy = jest.spyOn(deferred, 'resolve')
    webhookWaitMap.setWithExpiry(
      incomingPaymentId,
      deferred,
      Config.webhookTimeoutMs
    )

    await webhookHandlerRoutes.handleWebhook(ctx)
    expect(ctx.status).toEqual(202)
    expect(deferredSpy).toHaveBeenCalledWith(ctx.request.body)
  })

  test('Handles webhook for unknown incoming payment', async (): Promise<void> => {
    const incomingPaymentId = faker.internet.url()
    const ctx = createHandleWebhookContext({
      id: v4(),
      type: 'incoming_payment.completed',
      data: {
        id: incomingPaymentId,
        completed: true
      }
    })

    const mapSpy = jest.spyOn(webhookWaitMap, 'get')
    await expect(webhookHandlerRoutes.handleWebhook(ctx)).rejects.toMatchObject(
      {
        status: 404,
        message: 'Not awaiting webhook for incoming payment id'
      }
    )
    expect(mapSpy).toHaveBeenCalledWith(incomingPaymentId)
  })

  test('Handles webhook for invalid incoming payment event', async (): Promise<void> => {
    const incomingPaymentId = faker.internet.url()
    const ctx = createHandleWebhookContext({
      id: v4(),
      type: 'incoming_payment.created',
      data: {
        id: incomingPaymentId,
        completed: true
      }
    })

    const deferred = new Deferred<WebhookBody>()
    const deferredSpy = jest.spyOn(deferred, 'resolve')
    const mapSpy = jest.spyOn(webhookWaitMap, 'get')
    await expect(webhookHandlerRoutes.handleWebhook(ctx)).rejects.toMatchObject(
      {
        status: 400,
        message: 'Invalid webhook event type'
      }
    )
    expect(mapSpy).not.toHaveBeenCalled()
    expect(deferredSpy).not.toHaveBeenCalled()
  })
})

function createHandleWebhookContext(body: WebhookBody) {
  return createContext<HandleWebhookContext>({
    headers: { Accept: 'application/json' },
    method: 'POST',
    url: '/webhook',
    body
  })
}
