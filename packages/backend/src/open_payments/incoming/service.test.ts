import assert from 'assert'
import Knex from 'knex'
import { WorkerUtils, makeWorkerUtils } from 'graphile-worker'
import { v4 as uuid } from 'uuid'

import { IncomingPaymentService } from './service'
import { AccountingService } from '../../accounting/service'
import { createTestApp, TestContainer } from '../../tests/app'
import {
  IncomingPayment,
  IncomingPaymentEvent,
  IncomingPaymentEventType
} from './model'
import { resetGraphileDb } from '../../tests/graphileDb'
import { GraphileProducer } from '../../messaging/graphileProducer'
import { Config } from '../../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../..'
import { AppServices } from '../../app'
import { Pagination } from '../../shared/baseModel'
import { getPageTests } from '../../shared/baseModel.test'
import { randomAsset } from '../../tests/asset'
import { truncateTables } from '../../tests/tableManager'

describe('Incoming Payment Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let workerUtils: WorkerUtils
  let incomingPaymentService: IncomingPaymentService
  let knex: Knex
  let accountId: string
  let accountingService: AccountingService
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
      accountingService = await deps.use('accountingService')
      await workerUtils.migrate()
      messageProducer.setUtils(workerUtils)
      knex = await deps.use('knex')
    }
  )

  beforeEach(
    async (): Promise<void> => {
      incomingPaymentService = await deps.use('incomingPaymentService')
      const accountService = await deps.use('accountService')
      accountId = (await accountService.create({ asset: randomAsset() })).id
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
        amount: BigInt(123),
        expiresAt: new Date(Date.now() + 30_000),
        description: 'Test incoming payment'
      })
      const accountService = await deps.use('accountService')
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
        amount: BigInt(123)
      })
      await expect(
        accountingService.getBalance(incomingPayment.id)
      ).resolves.toEqual(BigInt(0))
    })

    test('Cannot create incoming payment for nonexistent account', async (): Promise<void> => {
      await expect(
        incomingPaymentService.create({
          accountId: uuid(),
          amount: BigInt(123),
          expiresAt: new Date(Date.now() + 30_000),
          description: 'Test incoming payment'
        })
      ).rejects.toThrow(
        'unable to create incoming payment, account does not exist'
      )
    })

    test('Cannot fetch a bogus incoming payment', async (): Promise<void> => {
      await expect(incomingPaymentService.get(uuid())).resolves.toBeUndefined()
    })
  })

  describe('onCredit', (): void => {
    let incomingPayment: IncomingPayment

    beforeEach(
      async (): Promise<void> => {
        incomingPayment = await incomingPaymentService.create({
          accountId,
          description: 'Test incoming payment',
          amount: BigInt(123),
          expiresAt: new Date(Date.now() + 30_000)
        })
      }
    )

    test('Does not deactivate a partially paid incoming payment', async (): Promise<void> => {
      await expect(
        incomingPayment.onCredit({
          totalReceived: incomingPayment.amount - BigInt(1)
        })
      ).resolves.toEqual(incomingPayment)
      await expect(
        incomingPaymentService.get(incomingPayment.id)
      ).resolves.toMatchObject({
        active: true,
        processAt: new Date(incomingPayment.expiresAt.getTime())
      })
    })

    test('Deactivates fully paid incoming payment', async (): Promise<void> => {
      const now = new Date()
      jest.useFakeTimers('modern')
      jest.setSystemTime(now)
      await expect(
        incomingPayment.onCredit({
          totalReceived: incomingPayment.amount
        })
      ).resolves.toMatchObject({
        id: incomingPayment.id,
        active: false,
        processAt: new Date(now.getTime() + 30_000)
      })
      await expect(
        incomingPaymentService.get(incomingPayment.id)
      ).resolves.toMatchObject({
        active: false,
        processAt: new Date(now.getTime() + 30_000)
      })
    })
  })

  describe('processNext', (): void => {
    test('Does not process not-expired active incoming payment', async (): Promise<void> => {
      const { id: incomingPaymentId } = await incomingPaymentService.create({
        accountId,
        amount: BigInt(123),
        description: 'Test incoming payment',
        expiresAt: new Date(Date.now() + 30_000)
      })
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
        const incomingPayment = await incomingPaymentService.create({
          accountId,
          amount: BigInt(123),
          description: 'Test incoming payment',
          expiresAt: new Date(Date.now() - 40_000)
        })
        await expect(
          accountingService.createDeposit({
            id: uuid(),
            account: incomingPayment,
            amount: BigInt(1)
          })
        ).resolves.toBeUndefined()

        const now = new Date()
        jest.useFakeTimers('modern')
        jest.setSystemTime(now)
        await expect(incomingPaymentService.processNext()).resolves.toBe(
          incomingPayment.id
        )
        await expect(
          incomingPaymentService.get(incomingPayment.id)
        ).resolves.toMatchObject({
          active: false,
          processAt: new Date(now.getTime() + 30_000)
        })
      })

      test('Deletes an expired incoming payment (and account) with no money', async (): Promise<void> => {
        const incomingPayment = await incomingPaymentService.create({
          accountId,
          amount: BigInt(123),
          description: 'Test incoming payment',
          expiresAt: new Date(Date.now() - 40_000)
        })
        await expect(incomingPaymentService.processNext()).resolves.toBe(
          incomingPayment.id
        )
        expect(
          await incomingPaymentService.get(incomingPayment.id)
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
            incomingPayment = await incomingPaymentService.create({
              accountId,
              amount: BigInt(123),
              expiresAt: new Date(Date.now() + expiresAt),
              description: 'Test incoming payment'
            })
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
                totalReceived: incomingPayment.amount
              })
            }
            incomingPayment = (await incomingPaymentService.get(
              incomingPayment.id
            )) as IncomingPayment
            expect(incomingPayment.active).toBe(false)
            expect(incomingPayment.processAt).not.toBeNull()
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
        incomingPaymentService.create({
          accountId,
          amount: BigInt(123),
          expiresAt: new Date(Date.now() + 30_000),
          description: 'IncomingPayment'
        }),
      getPage: (pagination: Pagination) =>
        incomingPaymentService.getAccountIncomingPaymentsPage(
          accountId,
          pagination
        )
    })
  })
})
