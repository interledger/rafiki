import { IocContract } from '@adonisjs/fold'
import { makeWorkerUtils, WorkerUtils } from 'graphile-worker'
import { Knex } from 'knex'
import jestOpenAPI from 'jest-openapi'
import { v4 as uuid } from 'uuid'

import { AppServices, ReadContext } from '../../app'
import { Config, IAppConfig } from '../../config/app'
import { GraphileProducer } from '../../messaging/graphileProducer'
import { createTestApp, TestContainer } from '../../tests/app'
import { resetGraphileDb } from '../../tests/graphileDb'
import { truncateTables } from '../../tests/tableManager'
import { initIocContainer } from '../../'
import { ConnectionRoutes } from './routes'
import { createContext } from '../../tests/context'
import { Account } from '../account/model'
import { AccountService } from '../account/service'
import { IncomingPayment } from '../payment/incoming/model'
import { createIncomingPayment } from '../../tests/incomingPayment'
import base64url from 'base64url'

describe('Connection Routes', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let workerUtils: WorkerUtils
  let config: IAppConfig
  let accountService: AccountService
  let connectionRoutes: ConnectionRoutes
  const messageProducer = new GraphileProducer()
  const mockMessageProducer = {
    send: jest.fn()
  }

  beforeAll(async (): Promise<void> => {
    config = Config
    config.publicHost = 'https://wallet.example'
    config.authServerGrantUrl = 'https://auth.wallet.example/authorize'
    deps = await initIocContainer(config)
    deps.bind('messageProducer', async () => mockMessageProducer)
    appContainer = await createTestApp(deps)
    workerUtils = await makeWorkerUtils({
      connectionString: appContainer.connectionUrl
    })
    await workerUtils.migrate()
    messageProducer.setUtils(workerUtils)
    knex = await deps.use('knex')
    jestOpenAPI(await deps.use('openApi'))
  })

  const asset = {
    code: 'USD',
    scale: 2
  }
  let account: Account
  let incomingPayment: IncomingPayment
  beforeEach(async (): Promise<void> => {
    connectionRoutes = await deps.use('connectionRoutes')
    config = await deps.use('config')

    accountService = await deps.use('accountService')
    account = await accountService.create({ asset })
    incomingPayment = await createIncomingPayment(deps, {
      accountId: account.id,
      description: 'hello world',
      expiresAt: new Date(Date.now() + 30_000),
      incomingAmount: {
        value: BigInt('123'),
        assetScale: asset.scale,
        assetCode: asset.code
      },
      externalRef: '#123'
    })
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await resetGraphileDb(knex)
    await appContainer.shutdown()
    await workerUtils.release()
  })

  describe('get', (): void => {
    test('returns 404 for nonexistent connection id on incoming payment', async (): Promise<void> => {
      const ctx = createContext<ReadContext>(
        {
          headers: { Accept: 'application/json' },
          url: `/connections/${incomingPayment.connectionId}`
        },
        {
          connectionId: uuid()
        }
      )
      await expect(connectionRoutes.get(ctx)).rejects.toHaveProperty(
        'status',
        404
      )
    })

    test('returns 200 for correct connection id', async (): Promise<void> => {
      const ctx = createContext<ReadContext>(
        {
          headers: { Accept: 'application/json' },
          url: `/connections/${incomingPayment.connectionId}`
        },
        {
          connectionId: incomingPayment.connectionId
        }
      )
      await expect(connectionRoutes.get(ctx)).resolves.toBeUndefined()
      expect(ctx.response).toSatisfyApiSpec()

      const sharedSecret = (ctx.response.body as Record<string, unknown>)[
        'sharedSecret'
      ]

      expect(ctx.body).toEqual({
        id: `${config.publicHost}/connections/${incomingPayment.connectionId}`,
        ilpAddress: expect.stringMatching(/^test\.rafiki\.[a-zA-Z0-9_-]{95}$/),
        sharedSecret
      })
      const sharedSecretBuffer = Buffer.from(sharedSecret as string, 'base64')
      expect(sharedSecretBuffer).toHaveLength(32)
      expect(sharedSecret).toEqual(base64url(sharedSecretBuffer))
    })
  })
})
