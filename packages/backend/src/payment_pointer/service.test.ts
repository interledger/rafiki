import Knex from 'knex'
import { WorkerUtils, makeWorkerUtils } from 'graphile-worker'

import { PaymentPointerService } from './service'
import { createTestApp, TestContainer } from '../tests/app'
import { randomAsset } from '../tests/asset'
import { resetGraphileDb } from '../tests/graphileDb'
import { truncateTables } from '../tests/tableManager'
import { GraphileProducer } from '../messaging/graphileProducer'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'

describe('Payment Pointer Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let workerUtils: WorkerUtils
  let paymentPointerService: PaymentPointerService
  let knex: Knex
  const messageProducer = new GraphileProducer()
  const mockMessageProducer = {
    send: jest.fn()
  }

  beforeAll(
    async (): Promise<void> => {
      deps = await initIocContainer(Config)
      deps.bind('messageProducer', async () => mockMessageProducer)
      appContainer = await createTestApp(deps)
      workerUtils = await makeWorkerUtils({
        connectionString: appContainer.connectionUrl
      })
      await workerUtils.migrate()
      messageProducer.setUtils(workerUtils)
      knex = await deps.use('knex')
      paymentPointerService = await deps.use('paymentPointerService')
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

  describe('Create or Get Payment Pointer', (): void => {
    test('Payment pointer can be created or fetched', async (): Promise<void> => {
      const options = {
        asset: randomAsset()
      }
      const paymentPointer = await paymentPointerService.create(options)
      await expect(paymentPointer).toMatchObject(options)
      await expect(
        paymentPointerService.get(paymentPointer.id)
      ).resolves.toEqual(paymentPointer)
    })
  })
})
