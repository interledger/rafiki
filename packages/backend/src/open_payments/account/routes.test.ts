import Knex from 'knex'
import { WorkerUtils, makeWorkerUtils } from 'graphile-worker'
import { v4 as uuid } from 'uuid'

import { createContext } from '../../tests/context'
import { PaymentPointerService } from '../../payment_pointer/service'
import { createTestApp, TestContainer } from '../../tests/app'
import { resetGraphileDb } from '../../tests/graphileDb'
import { GraphileProducer } from '../../messaging/graphileProducer'
import { Config, IAppConfig } from '../../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../'
import { AppServices } from '../../app'
import { truncateTables } from '../../tests/tableManager'
import { randomAsset } from '../../tests/asset'
import { AccountRoutes } from './routes'

describe('Account Routes', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let workerUtils: WorkerUtils
  let paymentPointerService: PaymentPointerService
  let config: IAppConfig
  let accountRoutes: AccountRoutes
  const messageProducer = new GraphileProducer()
  const mockMessageProducer = {
    send: jest.fn()
  }

  beforeAll(
    async (): Promise<void> => {
      config = Config
      config.publicHost = 'https://wallet.example'
      deps = await initIocContainer(config)
      deps.bind('messageProducer', async () => mockMessageProducer)
      appContainer = await createTestApp(deps)
      workerUtils = await makeWorkerUtils({
        connectionString: appContainer.connectionUrl
      })
      await workerUtils.migrate()
      messageProducer.setUtils(workerUtils)
      knex = await deps.use('knex')
    }
  )

  beforeEach(
    async (): Promise<void> => {
      paymentPointerService = await deps.use('paymentPointerService')
      config = await deps.use('config')
      accountRoutes = await deps.use('accountRoutes')
    }
  )

  afterEach(
    async (): Promise<void> => {
      await truncateTables(knex)
    }
  )

  afterAll(
    async (): Promise<void> => {
      await resetGraphileDb(knex)
      await appContainer.shutdown()
      await workerUtils.release()
    }
  )

  describe('get', (): void => {
    test('returns 400 on invalid id', async (): Promise<void> => {
      const ctx = createContext(
        {
          headers: { Accept: 'application/json' }
        },
        { paymentPointerId: 'not_a_uuid' }
      )
      await expect(accountRoutes.get(ctx)).rejects.toHaveProperty('status', 400)
    })

    test('returns 404 for nonexistent account', async (): Promise<void> => {
      const ctx = createContext(
        {
          headers: { Accept: 'application/json' }
        },
        { paymentPointerId: uuid() }
      )
      await expect(accountRoutes.get(ctx)).rejects.toHaveProperty('status', 404)
    })

    test('returns 406 for wrong Accept', async (): Promise<void> => {
      const ctx = createContext(
        {
          headers: { Accept: 'application/spsp4+json' }
        },
        { paymentPointerId: uuid() }
      )
      await expect(accountRoutes.get(ctx)).rejects.toHaveProperty('status', 406)
    })

    test('returns 200 with an open payments account', async (): Promise<void> => {
      const asset = randomAsset()
      const paymentPointer = await paymentPointerService.create({ asset })
      const ctx = createContext(
        {
          headers: { Accept: 'application/json' }
        },
        { paymentPointerId: paymentPointer.id }
      )
      await expect(accountRoutes.get(ctx)).resolves.toBeUndefined()
      expect(ctx.status).toBe(200)
      expect(ctx.response.get('Content-Type')).toBe(
        'application/json; charset=utf-8'
      )

      expect(ctx.body).toEqual({
        id: `https://wallet.example/accounts/${paymentPointer.id}`,
        accountServicer: 'https://wallet.example',
        assetCode: asset.code,
        assetScale: asset.scale
      })
    })
  })
})
