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

  describe('Create Account', (): void => {
    test('Can create an account', async (): Promise<void> => {
      const account = {
        id: uuid(),
        disabled: false,
        balance: {
          assetCode: 'USD',
          assetScale: 9,
          current: BigInt(0)
        }
      }
      const createdAccount = await AccountsService.createAccount(account)
      expect(createdAccount).toEqual(account)
      const retrievedAccount = await AccountsService.getAccount(account.id)
      expect(retrievedAccount).toEqual(account)
    })

    test('Can create an account with an initial balance', async (): Promise<void> => {
      const account = {
        id: uuid(),
        disabled: false,
        balance: {
          assetCode: 'USD',
          assetScale: 9,
          current: BigInt(100)
        }
      }
      const createdAccount = await AccountsService.createAccount(account)
      expect(createdAccount).toEqual(account)
      const retrievedAccount = await AccountsService.getAccount(account.id)
      expect(retrievedAccount).toEqual(account)
    })

    test('Can create an account with all settings', async (): Promise<void> => {
      const id = uuid()
      const account = {
        id,
        disabled: false,
        balance: {
          assetCode: 'USD',
          assetScale: 9,
          current: BigInt(0),
          parentAccountId: uuid()
        },
        http: {
          incomingTokens: [uuid()],
          incomingEndpoint: '/incomingEndpoint',
          outgoingToken: uuid(),
          outgoingEndpoint: '/outgoingEndpoint'
        },
        stream: {
          enabled: true,
          suffix: id
        },
        routing: {
          ilpAddress: 'g.raio/' + id,
          prefixes: ['g.raio']
        }
      }
      const createdAccount = await AccountsService.createAccount(account)
      expect(createdAccount).toEqual(account)
      const retrievedAccount = await AccountsService.getAccount(id)
      expect(retrievedAccount).toEqual(account)
    })
  })

  describe('Create Transfer', (): void => {
    test('Can transfer between accounts', async (): Promise<void> => {
      // pass()
    })
  })

  describe('Account Deposit', (): void => {
    test('Can deposit to account', async (): Promise<void> => {
      // pass()
    })
  })

  describe('Account Withdraw', (): void => {
    test('Can withdraw from account', async (): Promise<void> => {
      // pass()
    })
  })

  describe('Deposit liquidity', (): void => {
    test('Can deposit to liquidity account', async (): Promise<void> => {
      // pass()
    })
  })

  describe('Withdraw liquidity', (): void => {
    test('Can withdraw liquidity account', async (): Promise<void> => {
      // pass()
    })
  })
})
