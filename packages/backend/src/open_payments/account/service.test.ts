import Knex from 'knex'
import { WorkerUtils, makeWorkerUtils } from 'graphile-worker'
import { v4 as uuid } from 'uuid'

import { Account, WebMonetizationEventType } from './model'
import { AccountService } from './service'
import { AccountingService } from '../../accounting/service'
import { createTestApp, TestContainer } from '../../tests/app'
import { randomAsset } from '../../tests/asset'
import { resetGraphileDb } from '../../tests/graphileDb'
import { truncateTables } from '../../tests/tableManager'
import { GraphileProducer } from '../../messaging/graphileProducer'
import { WebhookEvent } from '../../webhook/model'
import { Config } from '../../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../'
import { AppServices } from '../../app'
import { faker } from '@faker-js/faker'

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

    test('Account with a public name can be created or fetched', async (): Promise<void> => {
      const publicName = faker.name.firstName()

      const options = {
        publicName: publicName,
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
      withdrawalThrottleDelay
      ${undefined}
      ${0}
      ${60_000}
    `(
      'withdrawalThrottleDelay: $withdrawalThrottleDelay',
      ({ withdrawalThrottleDelay }): void => {
        let delayProcessAt: Date | null = null

        beforeEach((): void => {
          jest.useFakeTimers('modern')
          jest.setSystemTime(new Date())
          if (withdrawalThrottleDelay !== undefined) {
            delayProcessAt = new Date(Date.now() + withdrawalThrottleDelay)
          }
        })

        describe.each`
          withdrawalThreshold
          ${null}
          ${BigInt(0)}
          ${BigInt(10)}
        `(
          'withdrawalThreshold: $withdrawalThreshold',
          ({ withdrawalThreshold }): void => {
            let thresholdProcessAt: Date | null = null

            beforeEach(
              async (): Promise<void> => {
                await account.asset.$query(knex).patch({
                  withdrawalThreshold
                })
                if (withdrawalThreshold !== null) {
                  thresholdProcessAt = new Date()
                }
              }
            )

            describe.each`
              startingProcessAt
              ${null}
              ${new Date(Date.now() + 30_000)}
            `(
              'startingProcessAt: $startingProcessAt',
              ({ startingProcessAt }): void => {
                beforeEach(
                  async (): Promise<void> => {
                    await account.$query(knex).patch({
                      processAt: startingProcessAt
                    })
                  }
                )

                describe.each`
                  totalEventsAmount
                  ${BigInt(0)}
                  ${BigInt(10)}
                `(
                  'totalEventsAmount: $totalEventsAmount',
                  ({ totalEventsAmount }): void => {
                    beforeEach(
                      async (): Promise<void> => {
                        await account.$query(knex).patch({
                          totalEventsAmount
                        })
                      }
                    )
                    if (withdrawalThreshold !== BigInt(0)) {
                      test("Balance doesn't meet withdrawal threshold", async (): Promise<void> => {
                        await expect(
                          account.onCredit({
                            totalReceived: totalEventsAmount + BigInt(1),
                            withdrawalThrottleDelay
                          })
                        ).resolves.toMatchObject({
                          processAt: startingProcessAt || delayProcessAt
                        })
                        await expect(
                          accountService.get(account.id)
                        ).resolves.toMatchObject({
                          processAt: startingProcessAt || delayProcessAt
                        })
                      })
                    }

                    if (withdrawalThreshold !== null) {
                      test.each`
                        totalReceived                                          | description
                        ${totalEventsAmount + withdrawalThreshold}             | ${'meets'}
                        ${totalEventsAmount + withdrawalThreshold + BigInt(1)} | ${'exceeds'}
                      `(
                        'Balance $description withdrawal threshold',
                        async ({ totalReceived }): Promise<void> => {
                          await expect(
                            account.onCredit({
                              totalReceived
                            })
                          ).resolves.toMatchObject({
                            processAt: thresholdProcessAt
                          })
                          await expect(
                            accountService.get(account.id)
                          ).resolves.toMatchObject({
                            processAt: thresholdProcessAt
                          })
                        }
                      )
                    }
                  }
                )
              }
            )
          }
        )
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
      ${new Date(Date.now() + 60_000)} | ${'not ready'}
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
          WebhookEvent.query(knex).where({
            type: WebMonetizationEventType.WebMonetizationReceived,
            withdrawalAccountId: account.id,
            withdrawalAssetId: account.assetId,
            withdrawalAmount
          })
        ).resolves.toHaveLength(1)
      }
    )
  })

  describe('triggerEvents', (): void => {
    let accounts: Account[]
    const asset = randomAsset()

    beforeEach(
      async (): Promise<void> => {
        accounts = []
        for (let i = 0; i < 5; i++) {
          accounts.push(await accountService.create({ asset }))
        }
      }
    )

    test.each`
      processAt                        | description
      ${null}                          | ${'not scheduled'}
      ${new Date(Date.now() + 60_000)} | ${'not ready'}
    `(
      'Does not process account $description for withdrawal',
      async ({ processAt }): Promise<void> => {
        for (let i = 1; i < accounts.length; i++) {
          await accounts[i].$query(knex).patch({ processAt })
        }
        await expect(accountService.triggerEvents(10)).resolves.toEqual(0)
      }
    )

    test.each`
      limit | count
      ${1}  | ${1}
      ${4}  | ${4}
      ${10} | ${4}
    `(
      'Creates withdrawal webhook event(s) (limit: $limit)',
      async ({ limit, count }): Promise<void> => {
        const withdrawalAmount = BigInt(10)
        for (let i = 1; i < accounts.length; i++) {
          await expect(
            accountingService.createDeposit({
              id: uuid(),
              account: accounts[i],
              amount: withdrawalAmount
            })
          ).resolves.toBeUndefined()
          await accounts[i].$query(knex).patch({
            processAt: new Date()
          })
        }
        await expect(accountService.triggerEvents(limit)).resolves.toBe(count)
        await expect(
          WebhookEvent.query(knex).where({
            type: WebMonetizationEventType.WebMonetizationReceived
          })
        ).resolves.toHaveLength(count)
        for (let i = 1; i <= count; i++) {
          await expect(
            accountService.get(accounts[i].id)
          ).resolves.toMatchObject({
            processAt: null,
            totalEventsAmount: withdrawalAmount
          })
        }
        for (let i = count + 1; i < accounts.length; i++) {
          await expect(accountService.get(accounts[i].id)).resolves.toEqual(
            accounts[i]
          )
        }
      }
    )
  })
})
