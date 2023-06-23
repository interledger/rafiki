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
import { createAsset } from '../../tests/asset'
import { createPaymentPointer } from '../../tests/paymentPointer'
import { truncateTables } from '../../tests/tableManager'
import { Config, IAppConfig } from '../../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../'
import { AppServices } from '../../app'
import { faker } from '@faker-js/faker'
import { createIncomingPayment } from '../../tests/incomingPayment'
import { getPageInfo } from '../../shared/pagination'
import { getPageTests } from '../../shared/baseModel.test'
import { Pagination } from '../../shared/baseModel'
import { sleep } from '../../shared/utils'
import { withConfigOverride } from '../../tests/helpers'

describe('Open Payments Payment Pointer Service', (): void => {
  let deps: IocContract<AppServices>
  let config: IAppConfig
  let appContainer: TestContainer
  let paymentPointerService: PaymentPointerService
  let accountingService: AccountingService
  let knex: Knex

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    config = await deps.use('config')
    appContainer = await createTestApp(deps)
    knex = appContainer.knex
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
    let options: CreateOptions

    beforeEach(async (): Promise<void> => {
      const { id: assetId } = await createAsset(deps)
      options = {
        url: 'https://alice.me/.well-known/pay',
        assetId
      }
    })

    test.each`
      publicName                  | description
      ${undefined}                | ${''}
      ${faker.person.firstName()} | ${'with publicName'}
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

    test('Cannot create payment pointer with unknown asset', async (): Promise<void> => {
      await expect(
        paymentPointerService.create({
          ...options,
          assetId: uuid()
        })
      ).resolves.toEqual(PaymentPointerError.UnknownAsset)
    })

    test.each`
      url                      | description
      ${'not a url'}           | ${'without a valid url'}
      ${'http://alice.me/pay'} | ${'with a non-https url'}
      ${'https://alice.me'}    | ${'with a url without a path'}
      ${'https://alice.me/'}   | ${'with a url without a path'}
    `(
      'Payment pointer cannot be created $description ($url)',
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

    test('Creating a payment pointer does not create an SPSP fallback account', async (): Promise<void> => {
      const paymentPointer = await paymentPointerService.create(options)
      assert.ok(!isPaymentPointerError(paymentPointer))
      await expect(
        accountingService.getBalance(paymentPointer.id)
      ).resolves.toBeUndefined()
    })
  })

  describe('Update Payment Pointer', (): void => {
    test.each`
      initialIsActive | status        | expectedIsActive
      ${true}         | ${undefined}  | ${true}
      ${true}         | ${'INACTIVE'} | ${false}
      ${false}        | ${'ACTIVE'}   | ${true}
      ${false}        | ${undefined}  | ${false}
    `(
      'Payment pointer with initial isActive of $initialIsActive can be updated with $status status ',
      async ({ initialIsActive, status, expectedIsActive }): Promise<void> => {
        const paymentPointer = await createPaymentPointer(deps)

        if (!initialIsActive) {
          await paymentPointer.$query(knex).patch({ deactivatedAt: new Date() })
        }

        const updatedPaymentPointer = await paymentPointerService.update({
          id: paymentPointer.id,
          status
        })
        assert.ok(!isPaymentPointerError(updatedPaymentPointer))

        expect(updatedPaymentPointer.isActive).toEqual(expectedIsActive)

        await expect(
          paymentPointerService.get(paymentPointer.id)
        ).resolves.toEqual(updatedPaymentPointer)
      }
    )

    test('publicName', async (): Promise<void> => {
      const paymentPointer = await createPaymentPointer(deps, {
        publicName: 'Initial Name'
      })
      const newName = 'New Name'
      const updatedPaymentPointer = await paymentPointerService.update({
        id: paymentPointer.id,
        publicName: newName
      })
      assert.ok(!isPaymentPointerError(updatedPaymentPointer))
      expect(updatedPaymentPointer.deactivatedAt).toEqual(null)
      expect(updatedPaymentPointer.publicName).toEqual(newName)
      await expect(
        paymentPointerService.get(paymentPointer.id)
      ).resolves.toEqual(updatedPaymentPointer)
    })

    describe('Deactivating payment pointer', (): void => {
      test(
        'Updates expiry dates of related incoming payments',
        withConfigOverride(
          () => config,
          {
            paymentPointerDeactivationPaymentGracePeriodMs: 2592000000,
            incomingPaymentExpiryMaxMs: 2592000000 * 3
          },
          async (): Promise<void> => {
            const paymentPointer = await createPaymentPointer(deps)
            const now = new Date('2023-06-01T00:00:00Z').getTime()
            jest.useFakeTimers({ now })

            const duration =
              config.paymentPointerDeactivationPaymentGracePeriodMs + 10_000
            const expiresAt = new Date(Date.now() + duration)

            const incomingPayment = await createIncomingPayment(deps, {
              paymentPointerId: paymentPointer.id,
              incomingAmount: {
                value: BigInt(123),
                assetCode: paymentPointer.asset.code,
                assetScale: paymentPointer.asset.scale
              },
              description: 'Test incoming payment',
              expiresAt,
              externalRef: '#123'
            })

            await paymentPointerService.update({
              id: paymentPointer.id,
              status: 'INACTIVE'
            })
            const incomingPaymentUpdated = await incomingPayment.$query(knex)

            expect(incomingPaymentUpdated.expiresAt.getTime()).toEqual(
              expiresAt.getTime() +
                config.paymentPointerDeactivationPaymentGracePeriodMs -
                duration
            )
          }
        )
      )

      test(
        'Does not update expiry dates of related incoming payments when new expiry is greater',
        withConfigOverride(
          () => config,
          { paymentPointerDeactivationPaymentGracePeriodMs: 2592000000 },
          async (): Promise<void> => {
            const paymentPointer = await createPaymentPointer(deps)
            const now = new Date('2023-06-01T00:00:00Z').getTime()
            jest.useFakeTimers({ now })

            const duration = 30_000
            const expiresAt = new Date(Date.now() + duration)

            const incomingPayment = await createIncomingPayment(deps, {
              paymentPointerId: paymentPointer.id,
              incomingAmount: {
                value: BigInt(123),
                assetCode: paymentPointer.asset.code,
                assetScale: paymentPointer.asset.scale
              },
              description: 'Test incoming payment',
              expiresAt,
              externalRef: '#123'
            })

            await paymentPointerService.update({
              id: paymentPointer.id,
              status: 'INACTIVE'
            })
            const incomingPaymentUpdated = await incomingPayment.$query(knex)

            expect(incomingPaymentUpdated.expiresAt).toEqual(expiresAt)
          }
        )
      )
    })

    test('Cannot update unknown payment pointer', async (): Promise<void> => {
      await expect(
        paymentPointerService.update({
          id: uuid(),
          status: 'INACTIVE',
          publicName: 'Some Public Name'
        })
      ).resolves.toEqual(PaymentPointerError.UnknownPaymentPointer)
    })
  })

  describe('Get Payment Pointer By Url', (): void => {
    describe('existing payment pointer', (): void => {
      test('can retrieve payment pointer by url', async (): Promise<void> => {
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
    })

    describe('non-existing payment pointer', (): void => {
      test(
        'creates payment pointer not found event',
        withConfigOverride(
          () => config,
          { paymentPointerLookupTimeoutMs: 0 },
          async (): Promise<void> => {
            const paymentPointerUrl = `https://${faker.internet.domainName()}/.well-known/pay`
            await expect(
              paymentPointerService.getByUrl(paymentPointerUrl)
            ).resolves.toBeUndefined()

            const paymentPointerNotFoundEvents =
              await PaymentPointerEvent.query(knex).where({
                type: PaymentPointerEventType.PaymentPointerNotFound
              })

            expect(paymentPointerNotFoundEvents[0]).toMatchObject({
              data: { paymentPointerUrl }
            })
          }
        )
      )

      test(
        'polls for payment pointer',
        withConfigOverride(
          () => config,
          { paymentPointerPollingFrequencyMs: 10 },
          async (): Promise<void> => {
            const paymentPointerUrl = `https://${faker.internet.domainName()}/.well-known/pay`

            const [getByUrlPaymentPointer, createdPaymentPointer] =
              await Promise.all([
                paymentPointerService.getByUrl(paymentPointerUrl),
                (async () => {
                  await sleep(5)
                  return createPaymentPointer(deps, {
                    url: paymentPointerUrl
                  })
                })()
              ])

            assert.ok(getByUrlPaymentPointer)
            expect(getByUrlPaymentPointer).toEqual(createdPaymentPointer)
          }
        )
      )

      test(
        'returns undefined if no payment pointer exists with url',
        withConfigOverride(
          () => config,
          { paymentPointerLookupTimeoutMs: 1 },
          async (): Promise<void> => {
            await expect(
              paymentPointerService.getByUrl('test.nope')
            ).resolves.toBeUndefined()
          }
        )
      )
    })
  })

  describe('Payment Pointer pagination', (): void => {
    test.each`
      num   | pagination       | cursor  | start   | end     | hasNextPage | hasPreviousPage
      ${0}  | ${{ first: 5 }}  | ${null} | ${null} | ${null} | ${false}    | ${false}
      ${10} | ${{ first: 5 }}  | ${null} | ${0}    | ${4}    | ${true}     | ${false}
      ${5}  | ${{ first: 10 }} | ${null} | ${0}    | ${4}    | ${false}    | ${false}
      ${10} | ${{ first: 3 }}  | ${3}    | ${4}    | ${6}    | ${true}     | ${true}
      ${10} | ${{ last: 5 }}   | ${9}    | ${4}    | ${8}    | ${true}     | ${true}
    `(
      '$num payments, pagination $pagination with cursor $cursor',
      async ({
        num,
        pagination,
        cursor,
        start,
        end,
        hasNextPage,
        hasPreviousPage
      }): Promise<void> => {
        const paymentPointerIds: string[] = []
        for (let i = 0; i < num; i++) {
          const paymentPointer = await createPaymentPointer(deps)
          paymentPointerIds.push(paymentPointer.id)
        }
        if (cursor) {
          if (pagination.last) pagination.before = paymentPointerIds[cursor]
          else pagination.after = paymentPointerIds[cursor]
        }
        const page = await paymentPointerService.getPage(pagination)
        const pageInfo = await getPageInfo(
          (pagination) => paymentPointerService.getPage(pagination),
          page
        )
        expect(pageInfo).toEqual({
          startCursor: paymentPointerIds[start],
          endCursor: paymentPointerIds[end],
          hasNextPage,
          hasPreviousPage
        })
      }
    )
    describe('getPage', (): void => {
      getPageTests({
        createModel: () => createPaymentPointer(deps),
        getPage: (pagination?: Pagination) =>
          paymentPointerService.getPage(pagination)
      })
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
      paymentPointer = await createPaymentPointer(deps, {
        createLiquidityAccount: true
      })
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

    beforeEach(async (): Promise<void> => {
      const { id: assetId } = await createAsset(deps)
      paymentPointers = []
      for (let i = 0; i < 5; i++) {
        paymentPointers.push(
          await createPaymentPointer(deps, {
            assetId,
            createLiquidityAccount: true
          })
        )
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
