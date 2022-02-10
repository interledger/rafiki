import parser from 'cron-parser'
import Knex from 'knex'
import { WorkerUtils, makeWorkerUtils } from 'graphile-worker'
import { v4 as uuid } from 'uuid'

import { Account, AccountEvent, AccountEventType } from './model'
import { AccountService } from './service'
import { AccountingService } from '../../accounting/service'
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
  let accountingService: AccountingService
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
      accountingService = await deps.use('accountingService')
    }
  )

  afterEach(
    async (): Promise<void> => {
      jest.useRealTimers()
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

    test('Creating an account creates an SPSP fallback account', async (): Promise<void> => {
      const account = await accountService.create({ asset: randomAsset() })

      const accountingService = await deps.use('accountingService')
      await expect(accountingService.getBalance(account.id)).resolves.toEqual(
        BigInt(0)
      )
    })
  })

  describe('onCredit', (): void => {
    let account: Account

    beforeEach(
      async (): Promise<void> => {
        account = await accountService.create({
          asset: randomAsset()
        })
      }
    )

    describe.each`
      withdrawalThreshold
      ${null}
      ${BigInt(0)}
      ${BigInt(10)}
    `(
      'withdrawalThreshold: $withdrawalThreshold',
      ({ withdrawalThreshold }): void => {
        beforeEach(
          async (): Promise<void> => {
            await account.asset.$query(knex).patch({
              withdrawalThreshold
            })
          }
        )

        if (withdrawalThreshold) {
          test.each`
            totalReceived | totalEventsAmount
            ${BigInt(9)}  | ${BigInt(0)}
            ${BigInt(11)} | ${BigInt(10)}
          `(
            'Does nothing if balance is below withdrawal threshold',
            async ({ totalReceived, totalEventsAmount }): Promise<void> => {
              await account.$query(knex).patch({
                totalEventsAmount
              })
              await expect(
                account.onCredit({
                  totalReceived
                })
              ).resolves.toEqual(account)
              await expect(accountService.get(account.id)).resolves.toEqual(
                account
              )
            }
          )
        }

        if (withdrawalThreshold !== null) {
          test.each`
            totalReceived | totalEventsAmount | description
            ${BigInt(10)} | ${BigInt(0)}      | ${'meets'}
            ${BigInt(11)} | ${BigInt(0)}      | ${'exceeds'}
            ${BigInt(15)} | ${BigInt(5)}      | ${'meets'}
            ${BigInt(16)} | ${BigInt(5)}      | ${'exceeds'}
          `(
            'Schedules withdrawal if balance $description withdrawal threshold',
            async ({ totalReceived, totalEventsAmount }): Promise<void> => {
              await account.$query(knex).patch({
                totalEventsAmount
              })
              const now = new Date()
              jest.useFakeTimers('modern')
              jest.setSystemTime(now)
              await expect(
                account.onCredit({
                  totalReceived
                })
              ).resolves.toMatchObject({
                processAt: now
              })
              await expect(
                accountService.get(account.id)
              ).resolves.toMatchObject({
                processAt: now
              })
            }
          )
        }

        if (withdrawalThreshold !== BigInt(0)) {
          test('Schedules withdrawal based on configured cron', async (): Promise<void> => {
            const withdrawalCron = '*/2 * * * *'
            const processAt = parser
              .parseExpression(withdrawalCron)
              .next()
              .toDate()
            await expect(
              account.onCredit({
                totalReceived: BigInt(1),
                withdrawalCron
              })
            ).resolves.toMatchObject({ processAt })
            await expect(
              accountService.get(account.id)
            ).resolves.toMatchObject({ processAt })
          })

          test('Does not schedule cron if withdrawal is already scheduled', async (): Promise<void> => {
            await account.$query(knex).patch({
              processAt: new Date()
            })
            await expect(
              account.onCredit({
                totalReceived: BigInt(1),
                withdrawalCron: '*/2 * * * *'
              })
            ).resolves.toEqual(account)
            await expect(accountService.get(account.id)).resolves.toEqual(
              account
            )
          })
        }
      }
    )
  })

  describe('processNext', (): void => {
    let account: Account

    beforeEach(
      async (): Promise<void> => {
        account = await accountService.create({
          asset: randomAsset()
        })
      }
    )

    test.each`
      processAt                        | description
      ${null}                          | ${'not scheduled'}
      ${new Date(Date.now() + 30_000)} | ${'not ready'}
    `(
      'Does not process account $description for withdrawal',
      async ({ processAt }): Promise<void> => {
        await account.$query(knex).patch({ processAt })
        await expect(accountService.processNext()).resolves.toBeUndefined()
        await expect(accountService.get(account.id)).resolves.toEqual(account)
      }
    )

    test.each`
      totalReceived | totalEventsAmount | withdrawalAmount
      ${BigInt(10)} | ${BigInt(0)}      | ${BigInt(10)}
      ${BigInt(10)} | ${BigInt(1)}      | ${BigInt(9)}
    `(
      'Creates withdrawal webhook event',
      async ({
        totalReceived,
        totalEventsAmount,
        withdrawalAmount
      }): Promise<void> => {
        await expect(
          accountingService.createDeposit({
            id: uuid(),
            account,
            amount: totalReceived
          })
        ).resolves.toBeUndefined()
        await account.$query(knex).patch({
          processAt: new Date(),
          totalEventsAmount
        })
        await expect(accountService.processNext()).resolves.toBe(account.id)
        await expect(accountService.get(account.id)).resolves.toMatchObject({
          processAt: null,
          totalEventsAmount: totalEventsAmount + withdrawalAmount
        })
        await expect(
          AccountEvent.query(knex).where({
            type: AccountEventType.AccountWebMonetization,
            withdrawalAccountId: account.id,
            withdrawalAssetId: account.assetId,
            withdrawalAmount
          })
        ).resolves.toHaveLength(1)
      }
    )
  })
})
