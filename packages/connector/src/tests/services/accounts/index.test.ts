import { Transaction as KnexTransaction } from 'knex'
import { Model } from 'objection'
import { v4 as uuid } from 'uuid'
import { WorkerUtils, makeWorkerUtils } from 'graphile-worker'

import * as AccountsService from '../../../services/accounts'
import { clearBalances } from '../../../services/balances'
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
      clearBalances()
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
      const accountOptions = {
        id: uuid(),
        disabled: false,
        balance: {
          assetCode: 'USD',
          assetScale: 9
        }
      }
      const createdAccount = await AccountsService.createAccount(accountOptions)
      const account = {
        ...accountOptions,
        balance: {
          ...accountOptions.balance,
          current: BigInt(0)
        }
      }
      expect(createdAccount).toEqual(account)
      const retrievedAccount = await AccountsService.getAccount(account.id)
      expect(retrievedAccount).toEqual(account)
    })

    test('Can create an account with all settings', async (): Promise<void> => {
      const id = uuid()
      const accountOptions = {
        id,
        disabled: false,
        balance: {
          assetCode: 'USD',
          assetScale: 9,
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
      const createdAccount = await AccountsService.createAccount(accountOptions)
      const account = {
        ...accountOptions,
        balance: {
          ...accountOptions.balance,
          current: BigInt(0)
        }
      }
      expect(createdAccount).toEqual(account)
      const retrievedAccount = await AccountsService.getAccount(id)
      expect(retrievedAccount).toEqual(account)
    })
  })

  describe('Update Account', (): void => {
    test('Can update an account', async (): Promise<void> => {
      const accountOptions = {
        id: uuid(),
        disabled: false,
        balance: {
          assetCode: 'USD',
          assetScale: 9
        }
      }
      const account = await AccountsService.createAccount(accountOptions)
      const updatedAccount = await AccountsService.updateAccount({
        id: account.id,
        disabled: true
      })
      const expectedAccount = {
        ...account,
        disabled: true
      }
      expect(updatedAccount).toEqual(expectedAccount)
    })
  })

  describe('Create Transfer', (): void => {
    test.skip('Can transfer between accounts', async (): Promise<void> => {
      test.todo('write test')
    })
  })

  describe('Account Deposit', (): void => {
    test('Can deposit to account', async (): Promise<void> => {
      const { id } = await AccountsService.createAccount({
        id: uuid(),
        disabled: false,
        balance: {
          assetCode: 'USD',
          assetScale: 9
        }
      })
      const amount = BigInt(10)
      await AccountsService.deposit(id, amount)
      const {
        balance: { current, assetCode, assetScale }
      } = await AccountsService.getAccount(id)
      expect(current).toEqual(amount)
      const settlementBalance = await AccountsService.getSettlementBalance(
        assetCode,
        assetScale
      )
      expect(settlementBalance).toEqual(-amount)
    })

    test.skip("Can't deposit to nonexistent account", async (): Promise<void> => {
      test.todo('write test')
    })
  })

  describe('Account Withdraw', (): void => {
    test('Can withdraw from account', async (): Promise<void> => {
      const { id } = await AccountsService.createAccount({
        id: uuid(),
        disabled: false,
        balance: {
          assetCode: 'USD',
          assetScale: 9
        }
      })
      const startingBalance = BigInt(10)
      await AccountsService.deposit(id, startingBalance)
      const amount = BigInt(5)
      await AccountsService.withdraw(id, amount)
      const {
        balance: { current, assetCode, assetScale }
      } = await AccountsService.getAccount(id)
      expect(current).toEqual(startingBalance - amount)
      const settlementBalance = await AccountsService.getSettlementBalance(
        assetCode,
        assetScale
      )
      expect(settlementBalance).toEqual(-(startingBalance - amount))
    })

    test.skip("Can't withdraw from nonexistent account", async (): Promise<void> => {
      test.todo('write test')
    })

    test.skip("Can't withdraw more than the balance", async (): Promise<void> => {
      test.todo('write test')
    })
  })

  describe('Deposit liquidity', (): void => {
    test('Can deposit to liquidity account', async (): Promise<void> => {
      const assetCode = 'USD'
      const assetScale = 6
      const amount = BigInt(10)
      {
        await AccountsService.depositLiquidity(assetCode, assetScale, amount)
        const balance = await AccountsService.getLiquidityBalance(
          assetCode,
          assetScale
        )
        expect(balance).toEqual(amount)
        const settlementBalance = await AccountsService.getSettlementBalance(
          assetCode,
          assetScale
        )
        expect(settlementBalance).toEqual(-amount)
      }
      const amount2 = BigInt(5)
      {
        await AccountsService.depositLiquidity(assetCode, assetScale, amount2)
        const balance2 = await AccountsService.getLiquidityBalance(
          assetCode,
          assetScale
        )
        expect(balance2).toEqual(amount + amount2)
        const settlementBalance2 = await AccountsService.getSettlementBalance(
          assetCode,
          assetScale
        )
        expect(settlementBalance2).toEqual(-(amount + amount2))
      }
    })
  })

  describe('Withdraw liquidity', (): void => {
    test('Can withdraw liquidity account', async (): Promise<void> => {
      const assetCode = 'USD'
      const assetScale = 6
      const startingBalance = BigInt(10)
      await AccountsService.depositLiquidity(
        assetCode,
        assetScale,
        startingBalance
      )
      const amount = BigInt(5)
      {
        await AccountsService.withdrawLiquidity(assetCode, assetScale, amount)
        const balance = await AccountsService.getLiquidityBalance(
          assetCode,
          assetScale
        )
        expect(balance).toEqual(startingBalance - amount)
        const settlementBalance = await AccountsService.getSettlementBalance(
          assetCode,
          assetScale
        )
        expect(settlementBalance).toEqual(-(startingBalance - amount))
      }
      const amount2 = BigInt(5)
      {
        await AccountsService.withdrawLiquidity(assetCode, assetScale, amount2)
        const balance = await AccountsService.getLiquidityBalance(
          assetCode,
          assetScale
        )
        expect(balance).toEqual(startingBalance - amount - amount2)
        const settlementBalance = await AccountsService.getSettlementBalance(
          assetCode,
          assetScale
        )
        expect(settlementBalance).toEqual(-(startingBalance - amount - amount2))
      }
    })

    test.skip("Can't withdraw more than the balance", async (): Promise<void> => {
      test.todo('write test')
    })
  })
})
