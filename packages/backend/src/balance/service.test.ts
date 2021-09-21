import { WorkerUtils, makeWorkerUtils } from 'graphile-worker'
import { v4 as uuid } from 'uuid'

import { BalanceService, BalanceError } from './service'
import { createTestApp, TestContainer } from '../tests/app'
import { resetGraphileDb } from '../tests/graphileDb'
import { GraphileProducer } from '../messaging/graphileProducer'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'

describe('Balance Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let workerUtils: WorkerUtils
  let balanceService: BalanceService
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
      balanceService = await deps.use('balanceService')
    }
  )

  afterAll(
    async (): Promise<void> => {
      await resetGraphileDb(appContainer.knex)
      await appContainer.shutdown()
      await workerUtils.release()
    }
  )

  describe('Balance', (): void => {
    test('A balance can be created and fetched', async (): Promise<void> => {
      const balances = [
        {
          id: uuid(),
          unit: 1
        },
        {
          id: uuid(),
          unit: 2,
          debitBalance: false
        },
        {
          id: uuid(),
          unit: 2,
          debitBalance: true
        }
      ]
      await expect(balanceService.create(balances)).resolves.toBeUndefined()
      const retrievedBalances = await balanceService.get(
        balances.map(({ id }) => id)
      )
      expect(retrievedBalances).toEqual(
        balances.map((balance) => ({
          ...balance,
          balance: 0n,
          debitBalance: !!balance.debitBalance
        }))
      )
    })

    test('Cannot create duplicate balance', async (): Promise<void> => {
      const id = uuid()
      const balances = [
        {
          id,
          unit: 1
        },
        {
          id,
          unit: 1
        },
        {
          id,
          unit: 2
        }
      ]
      await expect(balanceService.create(balances)).resolves.toEqual({
        index: 1,
        error: BalanceError.DuplicateBalance
      })
      await expect(balanceService.get([id])).resolves.toHaveLength(0)

      const balance = balances[0]
      await expect(balanceService.create([balance])).resolves.toBeUndefined()
      await expect(balanceService.get([id])).resolves.toHaveLength(1)
      await expect(balanceService.create([balance])).resolves.toEqual({
        index: 0,
        error: BalanceError.DuplicateBalance
      })
    })
  })
})
