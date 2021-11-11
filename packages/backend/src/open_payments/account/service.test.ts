import Knex from 'knex'
import { WorkerUtils, makeWorkerUtils } from 'graphile-worker'

import { AccountService } from './service'
import { createTestApp, TestContainer } from '../../tests/app'
import { randomAsset } from '../../tests/asset'
import { resetGraphileDb } from '../../tests/graphileDb'
import { truncateTables } from '../../tests/tableManager'
import { GraphileProducer } from '../../messaging/graphileProducer'
import { Config } from '../../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../'
import { AppServices } from '../../app'

describe('Open Payments Account Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let workerUtils: WorkerUtils
  let accountService: AccountService
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
      accountService = await deps.use('accountService')
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

  describe('Create or Get Account', (): void => {
    test('Account can be created or fetched', async (): Promise<void> => {
      const options = {
        asset: randomAsset()
      }
      const account = await accountService.create(options)
      await expect(account).toMatchObject(options)
      await expect(accountService.get(account.id)).resolves.toEqual(account)
    })
  })
})
