import assert from 'assert'
import { Knex } from 'knex'
import { v4 as uuid } from 'uuid'

import { isPaymentPointerError, PaymentPointerError } from './errors'
import {
  PaymentPointer,
  PaymentPointerEvent,
  PaymentPointerEventType
} from './model'
import {
  CreateOptions,
  FORBIDDEN_PATHS,
  PaymentPointerService
} from './service'
import { AccountingService } from '../../accounting/service'
import { createTestApp, TestContainer } from '../../tests/app'
import { randomAsset } from '../../tests/asset'
import { createPaymentPointer } from '../../tests/paymentPointer'
import { truncateTables } from '../../tests/tableManager'
import { Config } from '../../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../'
import { AppServices } from '../../app'
import { faker } from '@faker-js/faker'

describe('Open Payments Payment Pointer Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let paymentPointerService: PaymentPointerService
  let accountingService: AccountingService
  let knex: Knex

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    knex = await deps.use('knex')
    paymentPointerService = await deps.use('paymentPointerService')
    accountingService = await deps.use('accountingService')
  })

  afterEach(async (): Promise<void> => {
    jest.useRealTimers()
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('Create or Get Payment Pointer', (): void => {
    const options: CreateOptions = {
      url: 'https://alice.me/.well-known/pay',
      asset: randomAsset()
    }

    test.each`
      publicName                | description
      ${undefined}              | ${''}
      ${faker.name.firstName()} | ${'with publicName'}
    `(
      'Payment pointer can be created or fetched $description',
      async ({ publicName }): Promise<void> => {
        if (publicName) {
          options.publicName = publicName
        }
        const paymentPointer = await paymentPointerService.create(options)
        assert.ok(!isPaymentPointerError(paymentPointer))
        await expect(paymentPointer).toMatchObject(options)
        await expect(
          paymentPointerService.get(paymentPointer.id)
        ).resolves.toEqual(paymentPointer)
      }
    )

    test.each`
      url                    | description
      ${'not a url'}         | ${'without a valid url'}
      ${'https://alice.me'}  | ${'with a url without a path'}
      ${'https://alice.me/'} | ${'with a url without a path'}
    `(
      'Payment pointer cannot be created %description (%url)',
      async ({ url }): Promise<void> => {
        await expect(
          paymentPointerService.create({
            ...options,
            url
          })
        ).resolves.toEqual(PaymentPointerError.InvalidUrl)
      }
    )

    test.each(FORBIDDEN_PATHS.map((path) => [path]))(
      'Payment pointer cannot be created with forbidden url path (%s)',
      async (path): Promise<void> => {
        const url = `https://alice.me${path}`
        await expect(
          paymentPointerService.create({
            ...options,
            url
          })
        ).resolves.toEqual(PaymentPointerError.InvalidUrl)
        await expect(
          paymentPointerService.create({
            ...options,
            url: `${url}/more/path`
          })
        ).resolves.toEqual(PaymentPointerError.InvalidUrl)
      }
    )

    test.each(FORBIDDEN_PATHS.map((path) => [path]))(
      'Payment pointer cannot be created with forbidden url path (%s)',
      async (path): Promise<void> => {
        const url = `https://alice.me${path}`
        await expect(
          paymentPointerService.create({
            ...options,
            url
          })
        ).resolves.toEqual(PaymentPointerError.InvalidUrl)
        await expect(
          paymentPointerService.create({
            ...options,
            url: `${url}/more/path`
          })
        ).resolves.toEqual(PaymentPointerError.InvalidUrl)
      }
    )

    test('Creating a payment pointer creates an SPSP fallback account', async (): Promise<void> => {
      const paymentPointer = await paymentPointerService.create(options)
      assert.ok(!isPaymentPointerError(paymentPointer))

      const accountingService = await deps.use('accountingService')
      await expect(
        accountingService.getBalance(paymentPointer.id)
      ).resolves.toEqual(BigInt(0))
    })
  })

  describe('Get Payment Pointer By Url', (): void => {
    test('Can retrieve payment pointer by url', async (): Promise<void> => {
      const paymentPointer = await createPaymentPointer(deps)
      await expect(
        paymentPointerService.getByUrl(paymentPointer.url)
      ).resolves.toEqual(paymentPointer)

      await expect(
        paymentPointerService.getByUrl(paymentPointer.url + '/path')
      ).resolves.toBeUndefined()

      await expect(
        paymentPointerService.getByUrl('prefix+' + paymentPointer.url)
      ).resolves.toBeUndefined()
    })

    test('Returns undefined if no payment pointer exists with url', async (): Promise<void> => {
      await expect(
        paymentPointerService.getByUrl('test.nope')
      ).resolves.toBeUndefined()
    })
  })

  describe('onCredit', (): void => {
    let paymentPointer: PaymentPointer

    beforeEach(async (): Promise<void> => {
      paymentPointer = await createPaymentPointer(deps)
    })

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
          jest.useFakeTimers()
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

            beforeEach(async (): Promise<void> => {
              await paymentPointer.asset.$query(knex).patch({
                withdrawalThreshold
              })
              if (withdrawalThreshold !== null) {
                thresholdProcessAt = new Date()
              }
            })

            describe.each`
              startingProcessAt
              ${null}
              ${new Date(Date.now() + 30_000)}
            `(
              'startingProcessAt: $startingProcessAt',
              ({ startingProcessAt }): void => {
                beforeEach(async (): Promise<void> => {
                  await paymentPointer.$query(knex).patch({
                    processAt: startingProcessAt
                  })
                })

                describe.each`
                  totalEventsAmount
                  ${BigInt(0)}
                  ${BigInt(10)}
                `(
                  'totalEventsAmount: $totalEventsAmount',
                  ({ totalEventsAmount }): void => {
                    beforeEach(async (): Promise<void> => {
                      await paymentPointer.$query(knex).patch({
                        totalEventsAmount
                      })
                    })
                    if (withdrawalThreshold !== BigInt(0)) {
                      test("Balance doesn't meet withdrawal threshold", async (): Promise<void> => {
                        await expect(
                          paymentPointer.onCredit({
                            totalReceived: totalEventsAmount + BigInt(1),
                            withdrawalThrottleDelay
                          })
                        ).resolves.toMatchObject({
                          processAt: startingProcessAt || delayProcessAt
                        })
                        await expect(
                          paymentPointerService.get(paymentPointer.id)
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
                            paymentPointer.onCredit({
                              totalReceived
                            })
                          ).resolves.toMatchObject({
                            processAt: thresholdProcessAt
                          })
                          await expect(
                            paymentPointerService.get(paymentPointer.id)
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
    let paymentPointer: PaymentPointer

    beforeEach(async (): Promise<void> => {
      paymentPointer = await createPaymentPointer(deps)
    })

    test.each`
      processAt                        | description
      ${null}                          | ${'not scheduled'}
      ${new Date(Date.now() + 60_000)} | ${'not ready'}
    `(
      'Does not process payment pointer $description for withdrawal',
      async ({ processAt }): Promise<void> => {
        await paymentPointer.$query(knex).patch({ processAt })
        await expect(
          paymentPointerService.processNext()
        ).resolves.toBeUndefined()
        await expect(
          paymentPointerService.get(paymentPointer.id)
        ).resolves.toEqual(paymentPointer)
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
            account: paymentPointer,
            amount: totalReceived
          })
        ).resolves.toBeUndefined()
        await paymentPointer.$query(knex).patch({
          processAt: new Date(),
          totalEventsAmount
        })
        await expect(paymentPointerService.processNext()).resolves.toBe(
          paymentPointer.id
        )
        await expect(
          paymentPointerService.get(paymentPointer.id)
        ).resolves.toMatchObject({
          processAt: null,
          totalEventsAmount: totalEventsAmount + withdrawalAmount
        })
        await expect(
          PaymentPointerEvent.query(knex).where({
            type: PaymentPointerEventType.PaymentPointerWebMonetization,
            withdrawalAccountId: paymentPointer.id,
            withdrawalAssetId: paymentPointer.assetId,
            withdrawalAmount
          })
        ).resolves.toHaveLength(1)
      }
    )
  })

  describe('triggerEvents', (): void => {
    let paymentPointers: PaymentPointer[]
    const asset = randomAsset()

    beforeEach(async (): Promise<void> => {
      paymentPointers = []
      for (let i = 0; i < 5; i++) {
        paymentPointers.push(await createPaymentPointer(deps, { asset }))
      }
    })

    test.each`
      processAt                        | description
      ${null}                          | ${'not scheduled'}
      ${new Date(Date.now() + 60_000)} | ${'not ready'}
    `(
      'Does not process payment pointer $description for withdrawal',
      async ({ processAt }): Promise<void> => {
        for (let i = 1; i < paymentPointers.length; i++) {
          await paymentPointers[i].$query(knex).patch({ processAt })
        }
        await expect(paymentPointerService.triggerEvents(10)).resolves.toEqual(
          0
        )
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
        for (let i = 1; i < paymentPointers.length; i++) {
          await expect(
            accountingService.createDeposit({
              id: uuid(),
              account: paymentPointers[i],
              amount: withdrawalAmount
            })
          ).resolves.toBeUndefined()
          await paymentPointers[i].$query(knex).patch({
            processAt: new Date()
          })
        }
        await expect(paymentPointerService.triggerEvents(limit)).resolves.toBe(
          count
        )
        await expect(
          PaymentPointerEvent.query(knex).where({
            type: PaymentPointerEventType.PaymentPointerWebMonetization
          })
        ).resolves.toHaveLength(count)
        for (let i = 1; i <= count; i++) {
          await expect(
            paymentPointerService.get(paymentPointers[i].id)
          ).resolves.toMatchObject({
            processAt: null,
            totalEventsAmount: withdrawalAmount
          })
        }
        for (let i = count + 1; i < paymentPointers.length; i++) {
          await expect(
            paymentPointerService.get(paymentPointers[i].id)
          ).resolves.toEqual(paymentPointers[i])
        }
      }
    )
  })
})
