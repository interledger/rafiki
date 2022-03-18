import assert from 'assert'
import Knex from 'knex'
import { WorkerUtils, makeWorkerUtils } from 'graphile-worker'
import { v4 as uuid } from 'uuid'

import { CreateIncomingPaymentOptions, IncomingPaymentService } from './service'
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

  async function createPayment(
    options: CreateIncomingPaymentOptions
  ): Promise<IncomingPayment> {
    const payment = await incomingPaymentService.create(options)
    assert.ok(!isIncomingPaymentError(payment))
    return payment
  }

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
          amount: BigInt(123),
          assetCode: asset.code,
          assetScale: asset.scale
        },
        expiresAt: new Date(Date.now() + 30_000),
        description: 'Test incoming payment',
        externalRef: '#123',
        receiptsEnabled: false
      })
      assert.ok(!isIncomingPaymentError(incomingPayment))
      expect(incomingPayment).toMatchObject({
        id: incomingPayment.id,
        account: await accountService.get(accountId),
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
          amount: BigInt(123),
          assetCode: asset.code,
          assetScale: asset.scale
        },
        externalRef: '#123',
        receiptsEnabled: false
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
            amount: BigInt(123),
            assetCode: asset.code,
            assetScale: asset.scale
          },
          expiresAt: new Date(Date.now() + 30_000),
          description: 'Test incoming payment',
          externalRef: '#123',
          receiptsEnabled: false
        })
      ).resolves.toBe(IncomingPaymentError.UnknownAccount)
    })

    test('Cannot create incoming payment with different asset details than underlying account', async (): Promise<void> => {
      await expect(
        incomingPaymentService.create({
          accountId,
          incomingAmount: {
            amount: BigInt(123),
            assetCode: 'ABC',
            assetScale: asset.scale
          },
          expiresAt: new Date(Date.now() + 30_000),
          description: 'Test incoming payment',
          externalRef: '#123',
          receiptsEnabled: false
        })
      ).resolves.toBe(IncomingPaymentError.InvalidAmount)
      await expect(
        incomingPaymentService.create({
          accountId,
          incomingAmount: {
            amount: BigInt(123),
            assetCode: asset.code,
            assetScale: 20
          },
          expiresAt: new Date(Date.now() + 30_000),
          description: 'Test incoming payment',
          externalRef: '#123',
          receiptsEnabled: false
        })
      ).resolves.toBe(IncomingPaymentError.InvalidAmount)
    })

    test('Cannot fetch a bogus incoming payment', async (): Promise<void> => {
      await expect(incomingPaymentService.get(uuid())).resolves.toBeUndefined()
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
            amount: BigInt(123),
            assetCode: asset.code,
            assetScale: asset.scale
          },
          expiresAt: new Date(Date.now() + 30_000),
          externalRef: '#123',
          receiptsEnabled: false
        })
        assert.ok(!isIncomingPaymentError(incomingPaymentOrError))
        incomingPayment = incomingPaymentOrError
      }
    )

    test('Does not deactivate a partially paid incoming payment', async (): Promise<void> => {
      await expect(
        incomingPayment.onCredit({
          totalReceived: BigInt(100)
        })
      ).resolves.toMatchObject({
        id: incomingPayment.id,
        active: true,
        state: IncomingPaymentState.Processing,
        processAt: new Date(incomingPayment.expiresAt.getTime())
      })
      await expect(
        incomingPaymentService.get(incomingPayment.id)
      ).resolves.toMatchObject({
        active: true,
        state: IncomingPaymentState.Processing,
        processAt: new Date(incomingPayment.expiresAt.getTime())
      })
    })

    test('Deactivates fully paid incoming payment', async (): Promise<void> => {
      const now = new Date()
      jest.useFakeTimers('modern')
      jest.setSystemTime(now)
      await expect(
        incomingPayment.onCredit({
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          totalReceived: incomingPayment.incomingAmount!.amount
        })
      ).resolves.toMatchObject({
        id: incomingPayment.id,
        active: false,
        state: IncomingPaymentState.Completed,
        processAt: new Date(now.getTime() + 30_000)
      })
      await expect(
        incomingPaymentService.get(incomingPayment.id)
      ).resolves.toMatchObject({
        active: false,
        state: IncomingPaymentState.Completed,
        processAt: new Date(now.getTime() + 30_000)
      })
    })
  })

  describe('processNext', (): void => {
    test('Does not process not-expired active incoming payment', async (): Promise<void> => {
      const incomingPaymentOrError = await incomingPaymentService.create({
        accountId,
        incomingAmount: {
          amount: BigInt(123),
          assetCode: asset.code,
          assetScale: asset.scale
        },
        description: 'Test incoming payment',
        expiresAt: new Date(Date.now() + 30_000),
        externalRef: '#123',
        receiptsEnabled: false
      })
      assert.ok(!isIncomingPaymentError(incomingPaymentOrError))
      const incomingPaymentId = incomingPaymentOrError.id
      await expect(
        incomingPaymentService.processNext()
      ).resolves.toBeUndefined()
      await expect(
        incomingPaymentService.get(incomingPaymentId)
      ).resolves.toMatchObject({
        active: true
      })
    })

    describe('handleExpired', (): void => {
      test('Deactivates an expired incoming payment with received money', async (): Promise<void> => {
        const incomingPaymentOrError = await incomingPaymentService.create({
          accountId,
          incomingAmount: {
            amount: BigInt(123),
            assetCode: asset.code,
            assetScale: asset.scale
          },
          description: 'Test incoming payment',
          expiresAt: new Date(Date.now() - 40_000),
          externalRef: '#123',
          receiptsEnabled: false
        })
        assert.ok(!isIncomingPaymentError(incomingPaymentOrError))
        await expect(
          accountingService.createDeposit({
            id: uuid(),
            account: incomingPaymentOrError,
            amount: BigInt(1)
          })
        ).resolves.toBeUndefined()

        const now = new Date()
        jest.useFakeTimers('modern')
        jest.setSystemTime(now)
        await expect(incomingPaymentService.processNext()).resolves.toBe(
          incomingPaymentOrError.id
        )
        await expect(
          incomingPaymentService.get(incomingPaymentOrError.id)
        ).resolves.toMatchObject({
          active: false,
          state: IncomingPaymentState.Expired,
          processAt: new Date(now.getTime() + 30_000)
        })
      })

      test('Deletes an expired incoming payment (and account) with no money', async (): Promise<void> => {
        const incomingPaymentOrError = await incomingPaymentService.create({
          accountId,
          incomingAmount: {
            amount: BigInt(123),
            assetCode: asset.code,
            assetScale: asset.scale
          },
          description: 'Test incoming payment',
          expiresAt: new Date(Date.now() - 40_000),
          externalRef: '#123',
          receiptsEnabled: false
        })
        assert.ok(!isIncomingPaymentError(incomingPaymentOrError))
        await expect(incomingPaymentService.processNext()).resolves.toBe(
          incomingPaymentOrError.id
        )
        expect(
          await incomingPaymentService.get(incomingPaymentOrError.id)
        ).toBeUndefined()
      })
    })

    describe.each`
      eventType                                          | expiresAt  | amountReceived
      ${IncomingPaymentEventType.IncomingPaymentExpired} | ${-40_000} | ${BigInt(1)}
      ${IncomingPaymentEventType.IncomingPaymentPaid}    | ${30_000}  | ${BigInt(123)}
    `(
      'handleDeactivated ($eventType)',
      ({ eventType, expiresAt, amountReceived }): void => {
        let incomingPayment: IncomingPayment

        beforeEach(
          async (): Promise<void> => {
            const incomingPaymentOrError = await incomingPaymentService.create({
              accountId,
              incomingAmount: {
                amount: BigInt(123),
                assetCode: asset.code,
                assetScale: asset.scale
              },
              expiresAt: new Date(Date.now() + expiresAt),
              description: 'Test incoming payment',
              externalRef: '#123',
              receiptsEnabled: false
            })
            assert.ok(!isIncomingPaymentError(incomingPaymentOrError))
            incomingPayment = incomingPaymentOrError
            await expect(
              accountingService.createDeposit({
                id: uuid(),
                account: incomingPayment,
                amount: amountReceived
              })
            ).resolves.toBeUndefined()
            if (eventType === IncomingPaymentEventType.IncomingPaymentExpired) {
              await expect(incomingPaymentService.processNext()).resolves.toBe(
                incomingPayment.id
              )
            } else {
              await incomingPayment.onCredit({
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                totalReceived: incomingPayment.incomingAmount!.amount
              })
            }
            incomingPayment = (await incomingPaymentService.get(
              incomingPayment.id
            )) as IncomingPayment
            expect(incomingPayment.active).toBe(false)
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
        createPayment({
          accountId,
          incomingAmount: {
            amount: BigInt(123),
            assetCode: asset.code,
            assetScale: asset.scale
          },
          expiresAt: new Date(Date.now() + 30_000),
          description: 'IncomingPayment',
          externalRef: '#123',
          receiptsEnabled: false
        }),
      getPage: (pagination: Pagination) =>
        incomingPaymentService.getAccountIncomingPaymentsPage(
          accountId,
          pagination
        )
    })
  })
})
