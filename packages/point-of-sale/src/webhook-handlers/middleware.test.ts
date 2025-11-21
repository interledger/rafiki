import { createHmac } from 'crypto'
import { IocContract } from '@adonisjs/fold'
import { AppContainer, AppContext, AppServices } from '../app'
import { createTestApp, TestContainer } from '../tests/app'
import { initIocContainer } from '..'
import { Config, IAppConfig } from '../config/app'
import { WebhookBody } from './routes'
import { createContext } from '../tests/context'
import { canonicalize } from 'json-canonicalize'
import { v4 } from 'uuid'
import { faker } from '@faker-js/faker'
import { webhookHttpSigMiddleware } from './middleware'

describe('Webhook Signature Middleware', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let next: () => Promise<any>

  const webhookBody: WebhookBody = {
    id: v4(),
    type: 'incoming_payment.completed',
    data: {
      completed: true,
      id: faker.internet.url()
    }
  }

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
  })

  beforeEach((): void => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    next = jest.fn(async function (): Promise<any> {
      return null
    })
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  afterEach(async (): Promise<void> => {
    await jest.resetAllMocks()
  })

  test('Can verify a webhook signature', async (): Promise<void> => {
    const ctx = createWebhookSignatureContext(
      webhookBody,
      Config,
      appContainer.container
    )

    await webhookHttpSigMiddleware(ctx, next)
    expect(ctx.response.status).toEqual(200)
    expect(next).toHaveBeenCalled()
  })

  test('Allows empty signature header', async (): Promise<void> => {
    const ctx = createWebhookSignatureContext(
      webhookBody,
      Config,
      appContainer.container
    )
    ctx.headers['rafiki-signature'] = undefined

    await webhookHttpSigMiddleware(ctx, next)
    expect(ctx.response.status).toEqual(200)
    expect(next).toHaveBeenCalled()
  })

  test('Does not verify invalid signature digest', async (): Promise<void> => {
    const ctx = createWebhookSignatureContext(
      webhookBody,
      Config,
      appContainer.container
    )
    ctx.headers['rafiki-signature'] = `t=${Date.now()}, v1=invalid-digest`
    await expect(webhookHttpSigMiddleware(ctx, next)).rejects.toMatchObject({
      status: 401,
      message: 'invalid webhook signature'
    })
    expect(next).not.toHaveBeenCalled()
  })

  test('Does not verify invalid signature version', async (): Promise<void> => {
    const ctx = createWebhookSignatureContext(
      webhookBody,
      Config,
      appContainer.container
    )
    ctx.headers['rafiki-signature'] = (
      ctx.headers['rafiki-signature'] as string
    ).replace('v1=', 'v2=')
    await expect(webhookHttpSigMiddleware(ctx, next)).rejects.toMatchObject({
      status: 401,
      message: 'invalid webhook signature'
    })
    expect(next).not.toHaveBeenCalled()
  })
})

function createWebhookSignatureContext(
  body: WebhookBody,
  config: IAppConfig,
  container: AppContainer
) {
  return createContext<AppContext>(
    {
      headers: {
        Accept: 'application/json',
        'Rafiki-Signature': generateWebhookSignature(
          body,
          config.webhookSignatureSecret,
          config.webhookSignatureVersion
        )
      },
      method: 'POST',
      url: '/webhook',
      body
    },
    {},
    container
  )
}

function generateWebhookSignature(
  body: WebhookBody,
  secret: string,
  version: number
) {
  const timestamp = Date.now()

  const payload = `${timestamp}.${canonicalize(body)}`
  const hmac = createHmac('sha256', secret)
  hmac.update(payload)
  const digest = hmac.digest('hex')

  return `t=${timestamp}, v${version}=${digest}`
}
