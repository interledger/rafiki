import assert from 'assert'
import { Knex } from 'knex'
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
import { Config } from '../../../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../..'
import { AppServices } from '../../../app'
import { randomAsset } from '../../../tests/asset'
import { createIncomingPayment } from '../../../tests/incomingPayment'
import { createPaymentPointer } from '../../../tests/paymentPointer'
import { truncateTables } from '../../../tests/tableManager'
import { IncomingPaymentError, isIncomingPaymentError } from './errors'
import { getTests } from '../../payment_pointer/model.test'

describe('Incoming Payment Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let incomingPaymentService: IncomingPaymentService
  let knex: Knex
  let paymentPointerId: string
  let accountingService: AccountingService
  const asset = randomAsset()

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    accountingService = await deps.use('accountingService')
    knex = await deps.use('knex')
  })

  beforeEach(async (): Promise<void> => {
    incomingPaymentService = await deps.use('incomingPaymentService')
    paymentPointerId = (await createPaymentPointer(deps, { asset })).id
  })

  afterEach(async (): Promise<void> => {
    jest.useRealTimers()
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('Create IncomingPayment', (): void => {
    const amount = {
      value: BigInt(123),
      assetCode: asset.code,
      assetScale: asset.scale
    }

    test.each`
      clientId     | incomingAmount | expiresAt                        | description                | externalRef
      ${undefined} | ${undefined}   | ${undefined}                     | ${undefined}               | ${undefined}
      ${uuid()}    | ${amount}      | ${new Date(Date.now() + 30_000)} | ${'Test incoming payment'} | ${'#123'}
    `('An incoming payment can be created', async (options): Promise<void> => {
      const incomingPayment = await incomingPaymentService.create({
        paymentPointerId,
        ...options
      })
      assert.ok(!isIncomingPaymentError(incomingPayment))
      expect(incomingPayment).toMatchObject({
        id: incomingPayment.id,
        asset,
        processAt: new Date(incomingPayment.expiresAt.getTime())
      })
    })

    test('Cannot create incoming payment for nonexistent payment pointer', async (): Promise<void> => {
      await expect(
        incomingPaymentService.create({
          paymentPointerId: uuid(),
          incomingAmount: {
            value: BigInt(123),
            assetCode: asset.code,
            assetScale: asset.scale
          },
          expiresAt: new Date(Date.now() + 30_000),
          description: 'Test incoming payment',
          externalRef: '#123'
        })
      ).resolves.toBe(IncomingPaymentError.UnknownPaymentPointer)
    })

    test('Cannot create incoming payment with different asset details than underlying payment pointer', async (): Promise<void> => {
      await expect(
        incomingPaymentService.create({
          paymentPointerId,
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
          paymentPointerId,
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
          paymentPointerId,
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
          paymentPointerId,
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
          paymentPointerId,
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
  })

  describe('get/getPaymentPointerPage', (): void => {
    getTests({
      createModel: ({ clientId }) =>
        createIncomingPayment(deps, {
          paymentPointerId,
          clientId,
          incomingAmount: {
            value: BigInt(123),
            assetCode: asset.code,
            assetScale: asset.scale
          },
          expiresAt: new Date(Date.now() + 30_000),
          description: 'Test incoming payment',
          externalRef: '#123'
        }),
      get: (options) => incomingPaymentService.get(options),
      list: (options) => incomingPaymentService.getPaymentPointerPage(options)
    })
  })

  describe('onCredit', (): void => {
    let incomingPayment: IncomingPayment

    beforeEach(async (): Promise<void> => {
      const incomingPaymentOrError = await incomingPaymentService.create({
        paymentPointerId,
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
    })

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
        incomingPaymentService.get({
          id: incomingPayment.id
        })
      ).resolves.toMatchObject({
        state: IncomingPaymentState.Processing,
        processAt: new Date(incomingPayment.expiresAt.getTime())
      })
    })

    test('Sets state of fully paid incoming payment to "completed"', async (): Promise<void> => {
      const now = new Date()
      jest.useFakeTimers()
      jest.setSystemTime(now)
      await expect(
        incomingPayment.onCredit({
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          totalReceived: incomingPayment.incomingAmount!.value
        })
      ).resolves.toMatchObject({
        id: incomingPayment.id,
        state: IncomingPaymentState.Completed,
        processAt: new Date(now.getTime() + 30_000),
        connectionId: null
      })
      await expect(
        incomingPaymentService.get({
          id: incomingPayment.id
        })
      ).resolves.toMatchObject({
        state: IncomingPaymentState.Completed,
        processAt: new Date(now.getTime() + 30_000),
        connectionId: null
      })
    })
  })

  describe('processNext', (): void => {
    test('Does not process not-expired pending incoming payment', async (): Promise<void> => {
      const incomingPaymentOrError = await incomingPaymentService.create({
        paymentPointerId,
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
        incomingPaymentService.get({
          id: incomingPaymentId
        })
      ).resolves.toMatchObject({
        state: IncomingPaymentState.Pending
      })
    })

    describe('handleExpired', (): void => {
      test('Deactivates an expired incoming payment with received money', async (): Promise<void> => {
        const incomingPayment = await createIncomingPayment(deps, {
          paymentPointerId,
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
        jest.useFakeTimers()
        jest.setSystemTime(now)
        await expect(incomingPaymentService.processNext()).resolves.toBe(
          incomingPayment.id
        )
        await expect(
          incomingPaymentService.get({
            id: incomingPayment.id
          })
        ).resolves.toMatchObject({
          state: IncomingPaymentState.Expired,
          processAt: new Date(now.getTime() + 30_000),
          connectionId: null
        })
      })

      test('Deletes an expired incoming payment (and account) with no money', async (): Promise<void> => {
        const incomingPayment = await createIncomingPayment(deps, {
          paymentPointerId,
          incomingAmount: {
            value: BigInt(123),
            assetCode: asset.code,
            assetScale: asset.scale
          },
          description: 'Test incoming payment',
          expiresAt: new Date(Date.now() + 30_000),
          externalRef: '#123'
        })
        jest.useFakeTimers()
        jest.setSystemTime(incomingPayment.expiresAt)
        await expect(incomingPaymentService.processNext()).resolves.toBe(
          incomingPayment.id
        )
        expect(
          await incomingPaymentService.get({
            id: incomingPayment.id
          })
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

        beforeEach(async (): Promise<void> => {
          incomingPayment = await createIncomingPayment(deps, {
            paymentPointerId,
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
            jest.useFakeTimers()
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
          incomingPayment = (await incomingPaymentService.get({
            id: incomingPayment.id
          })) as IncomingPayment
          expect(incomingPayment).toMatchObject({
            state:
              eventType === IncomingPaymentEventType.IncomingPaymentExpired
                ? IncomingPaymentState.Expired
                : IncomingPaymentState.Completed,
            processAt: expect.any(Date),
            connectionId: null
          })
          await expect(
            accountingService.getTotalReceived(incomingPayment.id)
          ).resolves.toEqual(amountReceived)
          await expect(
            accountingService.getBalance(incomingPayment.id)
          ).resolves.toEqual(amountReceived)
        })

        test('Creates webhook event', async (): Promise<void> => {
          await expect(
            IncomingPaymentEvent.query(knex).where({
              type: eventType
            })
          ).resolves.toHaveLength(0)
          assert.ok(incomingPayment.processAt)
          jest.useFakeTimers()
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
            incomingPaymentService.get({
              id: incomingPayment.id
            })
          ).resolves.toMatchObject({
            processAt: null
          })
        })
      }
    )
  })

  describe('complete', (): void => {
    let incomingPayment: IncomingPayment

    beforeEach(async (): Promise<void> => {
      incomingPayment = await createIncomingPayment(deps, {
        paymentPointerId,
        description: 'Test incoming payment',
        incomingAmount: {
          value: BigInt(123),
          assetCode: asset.code,
          assetScale: asset.scale
        },
        expiresAt: new Date(Date.now() + 30_000),
        externalRef: '#123'
      })
    })
    test('updates state of pending incoming payment to complete', async (): Promise<void> => {
      const now = new Date()
      jest.spyOn(global.Date, 'now').mockImplementation(() => now.valueOf())
      await expect(
        incomingPaymentService.complete(incomingPayment.id)
      ).resolves.toMatchObject({
        id: incomingPayment.id,
        state: IncomingPaymentState.Completed,
        processAt: new Date(now.getTime() + 30_000),
        connectionId: null
      })
      await expect(
        incomingPaymentService.get({
          id: incomingPayment.id
        })
      ).resolves.toMatchObject({
        state: IncomingPaymentState.Completed,
        processAt: new Date(now.getTime() + 30_000),
        connectionId: null
      })
    })

    test('fails to complete unknown payment', async (): Promise<void> => {
      await expect(incomingPaymentService.complete(uuid())).resolves.toEqual(
        IncomingPaymentError.UnknownPayment
      )
    })

    test('updates state of processing incoming payment to complete', async (): Promise<void> => {
      await incomingPayment.onCredit({
        totalReceived: BigInt(100)
      })
      await expect(
        incomingPaymentService.get({
          id: incomingPayment.id
        })
      ).resolves.toMatchObject({
        state: IncomingPaymentState.Processing
      })
      await expect(
        incomingPaymentService.complete(incomingPayment.id)
      ).resolves.toMatchObject({
        id: incomingPayment.id,
        state: IncomingPaymentState.Completed,
        processAt: new Date(incomingPayment.expiresAt.getTime()),
        connectionId: null
      })
      await expect(
        incomingPaymentService.get({
          id: incomingPayment.id
        })
      ).resolves.toMatchObject({
        state: IncomingPaymentState.Completed,
        processAt: new Date(incomingPayment.expiresAt.getTime()),
        connectionId: null
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
      jest.useFakeTimers()
      jest.setSystemTime(future)
      await expect(incomingPaymentService.processNext()).resolves.toBe(
        incomingPayment.id
      )
      await expect(
        incomingPaymentService.get({
          id: incomingPayment.id
        })
      ).resolves.toMatchObject({
        state: IncomingPaymentState.Expired,
        connectionId: null
      })
      await expect(
        incomingPaymentService.complete(incomingPayment.id)
      ).resolves.toBe(IncomingPaymentError.WrongState)
      await expect(
        incomingPaymentService.get({
          id: incomingPayment.id
        })
      ).resolves.toMatchObject({
        state: IncomingPaymentState.Expired,
        connectionId: null
      })
    })

    test('fails to update state of completed incoming payment', async (): Promise<void> => {
      await incomingPayment.onCredit({
        totalReceived: BigInt(123)
      })
      await expect(
        incomingPaymentService.get({
          id: incomingPayment.id
        })
      ).resolves.toMatchObject({
        state: IncomingPaymentState.Completed,
        connectionId: null
      })
      await expect(
        incomingPaymentService.complete(incomingPayment.id)
      ).resolves.toBe(IncomingPaymentError.WrongState)
      await expect(
        incomingPaymentService.get({
          id: incomingPayment.id
        })
      ).resolves.toMatchObject({
        state: IncomingPaymentState.Completed,
        connectionId: null
      })
    })
  })
  describe('getByConnection', (): void => {
    let incomingPayment: IncomingPayment

    beforeEach(async (): Promise<void> => {
      incomingPayment = (await incomingPaymentService.create({
        paymentPointerId,
        description: 'Test incoming payment',
        incomingAmount: {
          value: BigInt(123),
          assetCode: asset.code,
          assetScale: asset.scale
        },
        expiresAt: new Date(Date.now() + 30_000),
        externalRef: '#123'
      })) as IncomingPayment
      assert.ok(!isIncomingPaymentError(incomingPayment))
    })
    test('returns incoming payment id on correct connectionId', async (): Promise<void> => {
      await expect(
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        incomingPaymentService.getByConnection(incomingPayment.connectionId!)
      ).resolves.toEqual(incomingPayment)
    })
    test('returns undefined on incorrect connectionId', async (): Promise<void> => {
      await expect(incomingPaymentService.getByConnection(uuid())).resolves
        .toBeUndefined
    })
  })
})
