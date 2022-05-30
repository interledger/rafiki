import assert from 'assert'
import Knex from 'knex'
import { WorkerUtils, makeWorkerUtils } from 'graphile-worker'
import { v4 as uuid } from 'uuid'

import { IncomingPaymentService } from './service'
import { AccountingService } from '../../../accounting/service'
import { createTestApp, TestContainer } from '../../../tests/app'
import {
  IncomingPayment,
  IncomingPaymentEvent,
  IncomingPaymentEventType,
  IncomingPaymentState
} from './model'
import { resetGraphileDb } from '../../../tests/graphileDb'
import { GraphileProducer } from '../../../messaging/graphileProducer'
import { Config } from '../../../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../..'
import { AppServices } from '../../../app'
import { Pagination } from '../../../shared/baseModel'
import { getPageTests } from '../../../shared/baseModel.test'
import { randomAsset } from '../../../tests/asset'
import { createIncomingPayment } from '../../../tests/incomingPayment'
import { truncateTables } from '../../../tests/tableManager'
import { IncomingPaymentError, isIncomingPaymentError } from './errors'
import { AccountService } from '../../account/service'

describe('Incoming Payment Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let workerUtils: WorkerUtils
  let incomingPaymentService: IncomingPaymentService
  let knex: Knex
  let accountId: string
  let accountingService: AccountingService
  let accountService: AccountService
  const messageProducer = new GraphileProducer()
  const mockMessageProducer = {
    send: jest.fn()
  }
  const asset = randomAsset()

  beforeAll(
    async (): Promise<void> => {
      deps = await initIocContainer(Config)
      deps.bind('messageProducer', async () => mockMessageProducer)
      appContainer = await createTestApp(deps)
      workerUtils = await makeWorkerUtils({
        connectionString: appContainer.connectionUrl
      })
      accountingService = await deps.use('accountingService')
      await workerUtils.migrate()
      messageProducer.setUtils(workerUtils)
      knex = await deps.use('knex')
    }
  )

  beforeEach(
    async (): Promise<void> => {
      incomingPaymentService = await deps.use('incomingPaymentService')
      accountService = await deps.use('accountService')
      accountId = (await accountService.create({ asset })).id
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

  describe('Create/Get IncomingPayment', (): void => {
    test('An incoming payment can be created and fetched', async (): Promise<void> => {
      const incomingPayment = await incomingPaymentService.create({
        accountId,
        incomingAmount: {
          value: BigInt(123),
          assetCode: asset.code,
          assetScale: asset.scale
        },
        expiresAt: new Date(Date.now() + 30_000),
        description: 'Test incoming payment',
        externalRef: '#123'
      })
      assert.ok(!isIncomingPaymentError(incomingPayment))
      expect(incomingPayment).toMatchObject({
        id: incomingPayment.id,
        asset,
        processAt: new Date(incomingPayment.expiresAt.getTime())
      })
      const retrievedIncomingPayment = await incomingPaymentService.get(
        incomingPayment.id
      )
      if (!retrievedIncomingPayment)
        throw new Error('incoming payment not found')
      expect(retrievedIncomingPayment).toEqual(incomingPayment)
    })

    test('Creating an incoming payment creates a liquidity account', async (): Promise<void> => {
      const incomingPayment = await incomingPaymentService.create({
        accountId,
        description: 'IncomingPayment',
        expiresAt: new Date(Date.now() + 30_000),
        incomingAmount: {
          value: BigInt(123),
          assetCode: asset.code,
          assetScale: asset.scale
        },
        externalRef: '#123'
      })
      assert.ok(!isIncomingPaymentError(incomingPayment))
      await expect(
        accountingService.getBalance(incomingPayment.id)
      ).resolves.toEqual(BigInt(0))
    })

    test('Cannot create incoming payment for nonexistent account', async (): Promise<void> => {
      await expect(
        incomingPaymentService.create({
          accountId: uuid(),
          incomingAmount: {
            value: BigInt(123),
            assetCode: asset.code,
            assetScale: asset.scale
          },
          expiresAt: new Date(Date.now() + 30_000),
          description: 'Test incoming payment',
          externalRef: '#123'
        })
      ).resolves.toBe(IncomingPaymentError.UnknownAccount)
    })

    test('Cannot create incoming payment with different asset details than underlying account', async (): Promise<void> => {
      await expect(
        incomingPaymentService.create({
          accountId,
          incomingAmount: {
            value: BigInt(123),
            assetCode: 'ABC',
            assetScale: asset.scale
          },
          expiresAt: new Date(Date.now() + 30_000),
          description: 'Test incoming payment',
          externalRef: '#123'
        })
      ).resolves.toBe(IncomingPaymentError.InvalidAmount)
      await expect(
        incomingPaymentService.create({
          accountId,
          incomingAmount: {
            value: BigInt(123),
            assetCode: asset.code,
            assetScale: 20
          },
          expiresAt: new Date(Date.now() + 30_000),
          description: 'Test incoming payment',
          externalRef: '#123'
        })
      ).resolves.toBe(IncomingPaymentError.InvalidAmount)
    })

    test('Cannot create incoming payment with non-positive amount', async (): Promise<void> => {
      await expect(
        incomingPaymentService.create({
          accountId,
          incomingAmount: {
            value: BigInt(0),
            assetCode: 'ABC',
            assetScale: asset.scale
          },
          expiresAt: new Date(Date.now() + 30_000),
          description: 'Test incoming payment',
          externalRef: '#123'
        })
      ).resolves.toBe(IncomingPaymentError.InvalidAmount)
      await expect(
        incomingPaymentService.create({
          accountId,
          incomingAmount: {
            value: BigInt(-13),
            assetCode: 'ABC',
            assetScale: asset.scale
          },
          expiresAt: new Date(Date.now() + 30_000),
          description: 'Test incoming payment',
          externalRef: '#123'
        })
      ).resolves.toBe(IncomingPaymentError.InvalidAmount)
    })

    test('Cannot create expired incoming payment', async (): Promise<void> => {
      await expect(
        incomingPaymentService.create({
          accountId,
          incomingAmount: {
            value: BigInt(0),
            assetCode: 'ABC',
            assetScale: asset.scale
          },
          expiresAt: new Date(Date.now() - 40_000),
          description: 'Test incoming payment',
          externalRef: '#123'
        })
      ).resolves.toBe(IncomingPaymentError.InvalidExpiry)
    })

    test('Cannot fetch a bogus incoming payment', async (): Promise<void> => {
      await expect(incomingPaymentService.get(uuid())).resolves.toBeUndefined()
    })

    test('throws if no TB account found', async (): Promise<void> => {
      const incomingPaymentOrError = await incomingPaymentService.create({
        accountId,
        description: 'Test incoming payment',
        incomingAmount: {
          value: BigInt(123),
          assetCode: asset.code,
          assetScale: asset.scale
        },
        expiresAt: new Date(Date.now() + 30_000),
        externalRef: '#123'
      })
      assert.ok(!isIncomingPaymentError(incomingPaymentOrError))

      jest
        .spyOn(accountingService, 'getTotalReceived')
        .mockResolvedValueOnce(undefined)
      await expect(
        incomingPaymentService.get(incomingPaymentOrError.id)
      ).rejects.toThrowError(
        `Underlying TB account not found, payment id: ${incomingPaymentOrError.id}`
      )
    })
  })

  describe('onCredit', (): void => {
    let incomingPayment: IncomingPayment

    beforeEach(
      async (): Promise<void> => {
        const incomingPaymentOrError = await incomingPaymentService.create({
          accountId,
          description: 'Test incoming payment',
          incomingAmount: {
            value: BigInt(123),
            assetCode: asset.code,
            assetScale: asset.scale
          },
          expiresAt: new Date(Date.now() + 30_000),
          externalRef: '#123'
        })
        assert.ok(!isIncomingPaymentError(incomingPaymentOrError))
        incomingPayment = incomingPaymentOrError
      }
    )

    test('Sets state of partially paid incoming payment to "processing"', async (): Promise<void> => {
      await expect(
        incomingPayment.onCredit({
          totalReceived: BigInt(100)
        })
      ).resolves.toMatchObject({
        id: incomingPayment.id,
        state: IncomingPaymentState.Processing,
        processAt: new Date(incomingPayment.expiresAt.getTime())
      })
      await expect(
        incomingPaymentService.get(incomingPayment.id)
      ).resolves.toMatchObject({
        state: IncomingPaymentState.Processing,
        processAt: new Date(incomingPayment.expiresAt.getTime())
      })
    })

    test('Sets state of fully paid incoming payment to "completed"', async (): Promise<void> => {
      const now = new Date()
      jest.useFakeTimers('modern')
      jest.setSystemTime(now)
      await expect(
        incomingPayment.onCredit({
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          totalReceived: incomingPayment.incomingAmount!.value
        })
      ).resolves.toMatchObject({
        id: incomingPayment.id,
        state: IncomingPaymentState.Completed,
        processAt: new Date(now.getTime() + 30_000)
      })
      await expect(
        incomingPaymentService.get(incomingPayment.id)
      ).resolves.toMatchObject({
        state: IncomingPaymentState.Completed,
        processAt: new Date(now.getTime() + 30_000)
      })
    })
  })

  describe('processNext', (): void => {
    test('Does not process not-expired pending incoming payment', async (): Promise<void> => {
      const incomingPaymentOrError = await incomingPaymentService.create({
        accountId,
        incomingAmount: {
          value: BigInt(123),
          assetCode: asset.code,
          assetScale: asset.scale
        },
        description: 'Test incoming payment',
        expiresAt: new Date(Date.now() + 30_000),
        externalRef: '#123'
      })
      assert.ok(!isIncomingPaymentError(incomingPaymentOrError))
      const incomingPaymentId = incomingPaymentOrError.id
      await expect(
        incomingPaymentService.processNext()
      ).resolves.toBeUndefined()
      await expect(
        incomingPaymentService.get(incomingPaymentId)
      ).resolves.toMatchObject({
        state: IncomingPaymentState.Pending
      })
    })

    describe('handleExpired', (): void => {
      test('Deactivates an expired incoming payment with received money', async (): Promise<void> => {
        const incomingPayment = await createIncomingPayment(deps, {
          accountId,
          incomingAmount: {
            value: BigInt(123),
            assetCode: asset.code,
            assetScale: asset.scale
          },
          description: 'Test incoming payment',
          expiresAt: new Date(Date.now() + 30_000),
          externalRef: '#123'
        })
        await expect(
          accountingService.createDeposit({
            id: uuid(),
            account: incomingPayment,
            amount: BigInt(1)
          })
        ).resolves.toBeUndefined()

        const now = incomingPayment.expiresAt
        jest.useFakeTimers('modern')
        jest.setSystemTime(now)
        await expect(incomingPaymentService.processNext()).resolves.toBe(
          incomingPayment.id
        )
        await expect(
          incomingPaymentService.get(incomingPayment.id)
        ).resolves.toMatchObject({
          state: IncomingPaymentState.Expired,
          processAt: new Date(now.getTime() + 30_000)
        })
      })

      test('Deletes an expired incoming payment (and account) with no money', async (): Promise<void> => {
        const incomingPayment = await createIncomingPayment(deps, {
          accountId,
          incomingAmount: {
            value: BigInt(123),
            assetCode: asset.code,
            assetScale: asset.scale
          },
          description: 'Test incoming payment',
          expiresAt: new Date(Date.now() + 30_000),
          externalRef: '#123'
        })
        jest.useFakeTimers('modern')
        jest.setSystemTime(incomingPayment.expiresAt)
        await expect(incomingPaymentService.processNext()).resolves.toBe(
          incomingPayment.id
        )
        expect(
          await incomingPaymentService.get(incomingPayment.id)
        ).toBeUndefined()
      })
    })

    describe.each`
      eventType                                            | expiresAt                        | amountReceived
      ${IncomingPaymentEventType.IncomingPaymentExpired}   | ${new Date(Date.now() + 30_000)} | ${BigInt(1)}
      ${IncomingPaymentEventType.IncomingPaymentCompleted} | ${undefined}                     | ${BigInt(123)}
    `(
      'handleDeactivated ($eventType)',
      ({ eventType, expiresAt, amountReceived }): void => {
        let incomingPayment: IncomingPayment

        beforeEach(
          async (): Promise<void> => {
            incomingPayment = await createIncomingPayment(deps, {
              accountId,
              incomingAmount: {
                value: BigInt(123),
                assetCode: asset.code,
                assetScale: asset.scale
              },
              expiresAt,
              description: 'Test incoming payment',
              externalRef: '#123'
            })
            await expect(
              accountingService.createDeposit({
                id: uuid(),
                account: incomingPayment,
                amount: amountReceived
              })
            ).resolves.toBeUndefined()
            if (eventType === IncomingPaymentEventType.IncomingPaymentExpired) {
              jest.useFakeTimers('modern')
              jest.setSystemTime(incomingPayment.expiresAt)
              await expect(incomingPaymentService.processNext()).resolves.toBe(
                incomingPayment.id
              )
            } else {
              await incomingPayment.onCredit({
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                totalReceived: incomingPayment.incomingAmount!.value
              })
            }
            incomingPayment = (await incomingPaymentService.get(
              incomingPayment.id
            )) as IncomingPayment
            expect(incomingPayment.processAt).not.toBeNull()
            if (eventType === IncomingPaymentEventType.IncomingPaymentExpired) {
              expect(incomingPayment.state).toBe(IncomingPaymentState.Expired)
            } else {
              expect(incomingPayment.state).toBe(IncomingPaymentState.Completed)
            }
            await expect(
              accountingService.getTotalReceived(incomingPayment.id)
            ).resolves.toEqual(amountReceived)
            await expect(
              accountingService.getBalance(incomingPayment.id)
            ).resolves.toEqual(amountReceived)
          }
        )

        test('Creates webhook event', async (): Promise<void> => {
          await expect(
            IncomingPaymentEvent.query(knex).where({
              type: eventType
            })
          ).resolves.toHaveLength(0)
          assert.ok(incomingPayment.processAt)
          jest.useFakeTimers('modern')
          jest.setSystemTime(incomingPayment.processAt)
          await expect(incomingPaymentService.processNext()).resolves.toBe(
            incomingPayment.id
          )
          await expect(
            IncomingPaymentEvent.query(knex).where({
              type: eventType,
              withdrawalAccountId: incomingPayment.id,
              withdrawalAmount: amountReceived
            })
          ).resolves.toHaveLength(1)
          await expect(
            incomingPaymentService.get(incomingPayment.id)
          ).resolves.toMatchObject({
            processAt: null
          })
        })
      }
    )
  })

  describe('Incoming payment pagination', (): void => {
    getPageTests({
      createModel: () =>
        createIncomingPayment(deps, {
          accountId,
          incomingAmount: {
            value: BigInt(123),
            assetCode: asset.code,
            assetScale: asset.scale
          },
          expiresAt: new Date(Date.now() + 30_000),
          description: 'IncomingPayment',
          externalRef: '#123'
        }),
      getPage: (pagination: Pagination) =>
        incomingPaymentService.getAccountPage(accountId, pagination)
    })
  })

  describe('update', (): void => {
    let incomingPayment: IncomingPayment

    beforeEach(
      async (): Promise<void> => {
        const incomingPaymentOrError = await incomingPaymentService.create({
          accountId,
          description: 'Test incoming payment',
          incomingAmount: {
            value: BigInt(123),
            assetCode: asset.code,
            assetScale: asset.scale
          },
          expiresAt: new Date(Date.now() + 30_000),
          externalRef: '#123'
        })
        assert.ok(!isIncomingPaymentError(incomingPaymentOrError))
        incomingPayment = incomingPaymentOrError
      }
    )
    test('updates state of pending incoming payment to complete', async (): Promise<void> => {
      const now = new Date()
      jest.spyOn(global.Date, 'now').mockImplementation(() => now.valueOf())
      await expect(
        incomingPaymentService.update({
          id: incomingPayment.id,
          state: IncomingPaymentState.Completed
        })
      ).resolves.toMatchObject({
        id: incomingPayment.id,
        state: IncomingPaymentState.Completed,
        processAt: new Date(now.getTime() + 30_000)
      })
      await expect(
        incomingPaymentService.get(incomingPayment.id)
      ).resolves.toMatchObject({
        state: IncomingPaymentState.Completed,
        processAt: new Date(now.getTime() + 30_000)
      })
    })

    test('fails to update state of unknown payment', async (): Promise<void> => {
      await expect(
        incomingPaymentService.update({
          id: uuid(),
          state: IncomingPaymentState.Completed
        })
      ).resolves.toEqual(IncomingPaymentError.UnknownPayment)
    })

    test('updates state of processing incoming payment to complete', async (): Promise<void> => {
      await incomingPayment.onCredit({
        totalReceived: BigInt(100)
      })
      await expect(
        incomingPaymentService.get(incomingPayment.id)
      ).resolves.toMatchObject({
        state: IncomingPaymentState.Processing
      })
      await expect(
        incomingPaymentService.update({
          id: incomingPayment.id,
          state: IncomingPaymentState.Completed
        })
      ).resolves.toMatchObject({
        id: incomingPayment.id,
        state: IncomingPaymentState.Completed,
        processAt: new Date(incomingPayment.expiresAt.getTime())
      })
      await expect(
        incomingPaymentService.get(incomingPayment.id)
      ).resolves.toMatchObject({
        state: IncomingPaymentState.Completed,
        processAt: new Date(incomingPayment.expiresAt.getTime())
      })
    })

    test('fails to update state of expired incoming payment', async (): Promise<void> => {
      await expect(
        accountingService.createDeposit({
          id: uuid(),
          account: incomingPayment,
          amount: BigInt(1)
        })
      ).resolves.toBeUndefined()
      const future = new Date(Date.now() + 40_000)
      jest.useFakeTimers('modern')
      jest.setSystemTime(future)
      await expect(incomingPaymentService.processNext()).resolves.toBe(
        incomingPayment.id
      )
      await expect(
        incomingPaymentService.get(incomingPayment.id)
      ).resolves.toMatchObject({
        state: IncomingPaymentState.Expired
      })
      await expect(
        incomingPaymentService.update({
          id: incomingPayment.id,
          state: IncomingPaymentState.Completed
        })
      ).resolves.toBe(IncomingPaymentError.WrongState)
      await expect(
        incomingPaymentService.get(incomingPayment.id)
      ).resolves.toMatchObject({
        state: IncomingPaymentState.Expired
      })
    })

    test('fails to update state of completed incoming payment', async (): Promise<void> => {
      await incomingPayment.onCredit({
        totalReceived: BigInt(123)
      })
      await expect(
        incomingPaymentService.get(incomingPayment.id)
      ).resolves.toMatchObject({
        state: IncomingPaymentState.Completed
      })
      await expect(
        incomingPaymentService.update({
          id: incomingPayment.id,
          state: IncomingPaymentState.Completed
        })
      ).resolves.toBe(IncomingPaymentError.WrongState)
      await expect(
        incomingPaymentService.get(incomingPayment.id)
      ).resolves.toMatchObject({
        state: IncomingPaymentState.Completed
      })
    })
  })
})
