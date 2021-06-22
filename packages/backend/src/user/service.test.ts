import { Transaction as KnexTransaction } from 'knex'
import { WorkerUtils, makeWorkerUtils } from 'graphile-worker'

import { UserService } from './service'
import { createTestApp, TestContainer } from '../tests/app'
import { User } from './model'
import { resetGraphileDb } from '../tests/graphileDb'
import { GraphileProducer } from '../messaging/graphileProducer'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'

describe('User Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let trx: KnexTransaction
  let workerUtils: WorkerUtils
  let userService: UserService
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
    }
  )

  beforeEach(
    async (): Promise<void> => {
      trx = await appContainer.knex.transaction()
      userService = await deps.use('userService')
    }
  )

  afterEach(
    async (): Promise<void> => {
      await trx.rollback()
      await trx.destroy()
    }
  )

  afterAll(
    async (): Promise<void> => {
      await appContainer.shutdown()
      await workerUtils.release()
      await resetGraphileDb(appContainer.knex)
    }
  )

  describe('User', (): void => {
    let user: User

    beforeEach(
      async (): Promise<void> => {
        user = await userService.create()
      }
    )

    test('A user can be fetched', async (): Promise<void> => {
      const retrievedUser = await userService.get(user.id)
      expect(retrievedUser.id).toEqual(user.id)
      expect(retrievedUser.accountId).toEqual(user.accountId)
    })
  })
})
