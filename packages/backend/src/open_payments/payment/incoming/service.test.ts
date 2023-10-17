import assert from 'assert'
import { faker } from '@faker-js/faker'
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
import { Config, IAppConfig } from '../../../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../..'
import { AppServices } from '../../../app'
import { Asset } from '../../../asset/model'
import { createAsset } from '../../../tests/asset'
import { createIncomingPayment } from '../../../tests/incomingPayment'
import { createWalletAddress } from '../../../tests/walletAddress'
import { truncateTables } from '../../../tests/tableManager'
import { IncomingPaymentError, isIncomingPaymentError } from './errors'
import { Amount } from '../../amount'
import { getTests } from '../../wallet_address/model.test'
import { WalletAddress } from '../../wallet_address/model'

describe('Incoming Payment Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let incomingPaymentService: IncomingPaymentService
  let knex: Knex
  let walletAddressId: string
  let accountingService: AccountingService
  let asset: Asset
  let config: IAppConfig

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    accountingService = await deps.use('accountingService')
    knex = appContainer.knex
    incomingPaymentService = await deps.use('incomingPaymentService')
    config = await deps.use('config')
  })

  beforeEach(async (): Promise<void> => {
    asset = await createAsset(deps)
    walletAddressId = (await createWalletAddress(deps, { assetId: asset.id }))
      .id
  })

  afterEach(async (): Promise<void> => {
    jest.useRealTimers()
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('Create IncomingPayment', (): void => {
    let amount: Amount

    beforeEach((): void => {
      amount = {
        value: BigInt(123),
        assetCode: asset.code,
        assetScale: asset.scale
      }
    })

    test.each`
      client                                        | incomingAmount | expiresAt                        | metadata
      ${undefined}                                  | ${false}       | ${undefined}                     | ${undefined}
      ${faker.internet.url({ appendSlash: false })} | ${true}        | ${new Date(Date.now() + 30_000)} | ${{ description: 'Test incoming payment', externalRef: '#123', items: [1, 2, 3] }}
    `('An incoming payment can be created', async (options): Promise<void> => {
      await expect(
        IncomingPaymentEvent.query(knex).where({
          type: IncomingPaymentEventType.IncomingPaymentCreated
        })
      ).resolves.toHaveLength(0)
      const incomingPayment = await incomingPaymentService.create({
        walletAddressId,
        ...options,
        incomingAmount: options.incomingAmount ? amount : undefined
      })
      assert.ok(!isIncomingPaymentError(incomingPayment))
      expect(incomingPayment).toMatchObject({
        id: incomingPayment.id,
        asset,
        processAt: new Date(incomingPayment.expiresAt.getTime()),
        metadata: options.metadata ?? null
      })
      await expect(
        IncomingPaymentEvent.query(knex).where({
          type: IncomingPaymentEventType.IncomingPaymentCreated
        })
      ).resolves.toHaveLength(1)
    })

    test('Cannot create incoming payment for nonexistent wallet address', async (): Promise<void> => {
      await expect(
        incomingPaymentService.create({
          walletAddressId: uuid(),
          incomingAmount: {
            value: BigInt(123),
            assetCode: asset.code,
            assetScale: asset.scale
          },
          expiresAt: new Date(Date.now() + 30_000),
          metadata: {
            description: 'Test incoming payment',
            externalRef: '#123'
          }
        })
      ).resolves.toBe(IncomingPaymentError.UnknownWalletAddress)
    })

    test('Cannot create incoming payment with different asset details than underlying wallet address', async (): Promise<void> => {
      await expect(
        incomingPaymentService.create({
          walletAddressId,
          incomingAmount: {
            value: BigInt(123),
            assetCode: asset.code.split('').reverse().join(''),
            assetScale: asset.scale
          },
          expiresAt: new Date(Date.now() + 30_000),
          metadata: {
            description: 'Test incoming payment',
            externalRef: '#123'
          }
        })
      ).resolves.toBe(IncomingPaymentError.InvalidAmount)
      await expect(
        incomingPaymentService.create({
          walletAddressId,
          incomingAmount: {
            value: BigInt(123),
            assetCode: asset.code,
            assetScale: (asset.scale + 1) % 256
          },
          expiresAt: new Date(Date.now() + 30_000),
          metadata: {
            description: 'Test incoming payment',
            externalRef: '#123'
          }
        })
      ).resolves.toBe(IncomingPaymentError.InvalidAmount)
    })

    test('Cannot create incoming payment with non-positive amount', async (): Promise<void> => {
      await expect(
        incomingPaymentService.create({
          walletAddressId,
          incomingAmount: {
            value: BigInt(0),
            assetCode: asset.code,
            assetScale: asset.scale
          },
          expiresAt: new Date(Date.now() + 30_000),
          metadata: {
            description: 'Test incoming payment',
            externalRef: '#123'
          }
        })
      ).resolves.toBe(IncomingPaymentError.InvalidAmount)
      await expect(
        incomingPaymentService.create({
          walletAddressId,
          incomingAmount: {
            value: BigInt(-13),
            assetCode: asset.code,
            assetScale: asset.scale
          },
          expiresAt: new Date(Date.now() + 30_000),
          metadata: {
            description: 'Test incoming payment',
            externalRef: '#123'
          }
        })
      ).resolves.toBe(IncomingPaymentError.InvalidAmount)
    })

    test('Cannot create expired incoming payment', async (): Promise<void> => {
      await expect(
        incomingPaymentService.create({
          walletAddressId,
          incomingAmount: {
            value: BigInt(10),
            assetCode: asset.code,
            assetScale: asset.scale
          },
          expiresAt: new Date(Date.now() - 40_000),
          metadata: {
            description: 'Test incoming payment',
            externalRef: '#123'
          }
        })
      ).resolves.toBe(IncomingPaymentError.InvalidExpiry)
    })

    test('Cannot create incoming payment with inactive wallet address', async (): Promise<void> => {
      const walletAddress = await WalletAddress.query(knex).patchAndFetchById(
        walletAddressId,
        { deactivatedAt: new Date() }
      )
      assert.ok(!walletAddress.isActive)
      await expect(
        incomingPaymentService.create({
          walletAddressId,
          incomingAmount: {
            value: BigInt(10),
            assetCode: asset.code,
            assetScale: asset.scale
          },
          expiresAt: new Date(Date.now() + 30_000),
          metadata: {
            description: 'Test incoming payment',
            externalRef: '#123'
          }
        })
      ).resolves.toBe(IncomingPaymentError.InactiveWalletAddress)
    })

    test('Cannot create incoming payment with expiresAt greater than max', async (): Promise<void> => {
      await expect(
        incomingPaymentService.create({
          walletAddressId,
          incomingAmount: {
            value: BigInt(123),
            assetCode: asset.code,
            assetScale: asset.scale
          },
          expiresAt: new Date(
            Date.now() + config.incomingPaymentExpiryMaxMs + 10_000
          ),
          metadata: {
            description: 'Test incoming payment',
            externalRef: '#123'
          }
        })
      ).resolves.toBe(IncomingPaymentError.InvalidExpiry)
    })
  })

  describe('get/getWalletAddressPage', (): void => {
    getTests({
      createModel: ({ client }) =>
        createIncomingPayment(deps, {
          walletAddressId,
          client,
          incomingAmount: {
            value: BigInt(123),
            assetCode: asset.code,
            assetScale: asset.scale
          },
          expiresAt: new Date(Date.now() + 30_000),
          metadata: {
            description: 'Test incoming payment',
            externalRef: '#123'
          }
        }),
      get: (options) => incomingPaymentService.get(options),
      list: (options) => incomingPaymentService.getWalletAddressPage(options)
    })
  })

  describe('onCredit', (): void => {
    let incomingPayment: IncomingPayment

    beforeEach(async (): Promise<void> => {
      const incomingPaymentOrError = await incomingPaymentService.create({
        walletAddressId,
        incomingAmount: {
          value: BigInt(123),
          assetCode: asset.code,
          assetScale: asset.scale
        },
        expiresAt: new Date(Date.now() + 30_000),
        metadata: {
          description: 'Test incoming payment',
          externalRef: '#123'
        }
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
        walletAddressId,
        incomingAmount: {
          value: BigInt(123),
          assetCode: asset.code,
          assetScale: asset.scale
        },
        expiresAt: new Date(Date.now() + 30_000),
        metadata: {
          description: 'Test incoming payment',
          externalRef: '#123'
        }
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
          walletAddressId,
          incomingAmount: {
            value: BigInt(123),
            assetCode: asset.code,
            assetScale: asset.scale
          },
          expiresAt: new Date(Date.now() + 30_000),
          metadata: {
            description: 'Test incoming payment',
            externalRef: '#123'
          }
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
          walletAddressId,
          incomingAmount: {
            value: BigInt(123),
            assetCode: asset.code,
            assetScale: asset.scale
          },
          expiresAt: new Date(Date.now() + 30_000),
          metadata: {
            description: 'Test incoming payment',
            externalRef: '#123'
          }
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
            walletAddressId,
            incomingAmount: {
              value: BigInt(123),
              assetCode: asset.code,
              assetScale: asset.scale
            },
            expiresAt,
            metadata: {
              description: 'Test incoming payment',
              externalRef: '#123'
            }
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
        walletAddressId,
        incomingAmount: {
          value: BigInt(123),
          assetCode: asset.code,
          assetScale: asset.scale
        },
        expiresAt: new Date(Date.now() + 30_000),
        metadata: {
          description: 'Test incoming payment',
          externalRef: '#123'
        }
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
        walletAddressId,
        incomingAmount: {
          value: BigInt(123),
          assetCode: asset.code,
          assetScale: asset.scale
        },
        expiresAt: new Date(Date.now() + 30_000),
        metadata: {
          description: 'Test incoming payment',
          externalRef: '#123'
        }
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
