import { WorkerUtils, makeWorkerUtils } from 'graphile-worker'
import { Client, CreateAccountError } from 'tigerbeetle-node'
import { v4 as uuid } from 'uuid'

import { BalanceService } from './service'
import { CreateBalanceError } from './errors'
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
  let tigerbeetle: Client
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
      tigerbeetle = await deps.use('tigerbeetle')
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
    test.each`
      unit | debitBalance
      ${1} | ${undefined}
      ${2} | ${false}
      ${3} | ${true}
    `(
      'A balance can be created and fetched { unit: $unit, debitBalance: $debitBalance }',
      async ({ unit, debitBalance }): Promise<void> => {
        const balance = await balanceService.create({ unit, debitBalance })
        expect(balance.unit).toEqual(unit)
        expect(balance.debitBalance).toEqual(!!debitBalance)
        const retrievedBalance = await balanceService.get(balance.id)
        expect(retrievedBalance).toEqual(balance)
      }
    )

    test('Create throws on error', async (): Promise<void> => {
      jest
        .spyOn(tigerbeetle, 'createAccounts')
        .mockImplementationOnce(async () => [
          {
            index: 0,
            code: CreateAccountError.exists_with_different_unit
          }
        ])
      await expect(balanceService.create({ unit: 1 })).rejects.toThrowError(
        new CreateBalanceError(CreateAccountError.exists_with_different_unit)
      )
    })

    test('Get returns undefined for nonexistent balance', async (): Promise<void> => {
      await expect(balanceService.get(uuid())).resolves.toBeUndefined()
    })
  })
})
