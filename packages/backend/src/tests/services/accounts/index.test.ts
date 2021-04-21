import { Transaction as KnexTransaction } from 'knex'
import { Model } from 'objection'
import { v4 as uuid } from 'uuid'
import { WorkerUtils, makeWorkerUtils } from 'graphile-worker'

import * as AccountsService from '../../../services/accounts'
import { createTestApp, TestContainer } from '../../helpers/app'
import { resetGraphileDb } from '../../helpers/graphileDb'
import { GraphileProducer } from '../../../infrastructure/graphileProducer'
import { Config } from '../../../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../..'
import { AppServices } from '../../../app'

describe('Accounting Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let trx: KnexTransaction
  let workerUtils: WorkerUtils
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
      Model.knex(trx)
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

  describe('Account', (): void => {
    test('Can create and get an account', async (): Promise<void> => {
      const account = {
        id: uuid(),
        disabled: false
      }
      const createdAccount = await AccountsService.createAccount(account)

      const retrievedAccount = await AccountsService.getAccount(
        createdAccount.id
      )

      expect(retrievedAccount.id).toEqual(account.id)
    })
  })
})
