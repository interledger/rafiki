import assert from 'assert'
import { Knex } from 'knex'
import { v4 as uuid } from 'uuid'

import { isWalletAddressError, WalletAddressError } from './errors'
import {
  WalletAddress,
  WalletAddressEvent,
  WalletAddressEventType
} from './model'
import {
  CreateOptions,
  FORBIDDEN_PATHS,
  WalletAddressService
} from './service'
import { AccountingService } from '../../accounting/service'
import { createTestApp, TestContainer } from '../../tests/app'
import { createAsset } from '../../tests/asset'
import { createWalletAddress } from '../../tests/walletAddress'
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

describe('Open Payments Wallet Address Service', (): void => {
  let deps: IocContract<AppServices>
  let config: IAppConfig
  let appContainer: TestContainer
  let walletAddressService: WalletAddressService
  let accountingService: AccountingService
  let knex: Knex

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    config = await deps.use('config')
    appContainer = await createTestApp(deps)
    knex = appContainer.knex
    walletAddressService = await deps.use('walletAddressService')
    accountingService = await deps.use('accountingService')
  })

  afterEach(async (): Promise<void> => {
    jest.useRealTimers()
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('Create or Get Wallet Address', (): void => {
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
      'Wallet address can be created or fetched $description',
      async ({ publicName }): Promise<void> => {
        if (publicName) {
          options.publicName = publicName
        }
        const walletAddress = await walletAddressService.create(options)
        assert.ok(!isWalletAddressError(walletAddress))
        await expect(walletAddress).toMatchObject(options)
        await expect(
          walletAddressService.get(walletAddress.id)
        ).resolves.toEqual(walletAddress)
      }
    )

    test('Cannot create wallet address with unknown asset', async (): Promise<void> => {
      await expect(
        walletAddressService.create({
          ...options,
          assetId: uuid()
        })
      ).resolves.toEqual(WalletAddressError.UnknownAsset)
    })

    test.each`
      url                      | description
      ${'not a url'}           | ${'without a valid url'}
      ${'http://alice.me/pay'} | ${'with a non-https url'}
      ${'https://alice.me'}    | ${'with a url without a path'}
      ${'https://alice.me/'}   | ${'with a url without a path'}
    `(
      'Wallet address cannot be created $description ($url)',
      async ({ url }): Promise<void> => {
        await expect(
          walletAddressService.create({
            ...options,
            url
          })
        ).resolves.toEqual(WalletAddressError.InvalidUrl)
      }
    )

    test.each(FORBIDDEN_PATHS.map((path) => [path]))(
      'Wallet address cannot be created with forbidden url path (%s)',
      async (path): Promise<void> => {
        const url = `https://alice.me${path}`
        await expect(
          walletAddressService.create({
            ...options,
            url
          })
        ).resolves.toEqual(WalletAddressError.InvalidUrl)
        await expect(
          walletAddressService.create({
            ...options,
            url: `${url}/more/path`
          })
        ).resolves.toEqual(WalletAddressError.InvalidUrl)
      }
    )

    test('Creating a wallet address does not create an SPSP fallback account', async (): Promise<void> => {
      const walletAddress = await walletAddressService.create(options)
      assert.ok(!isWalletAddressError(walletAddress))
      await expect(
        accountingService.getBalance(walletAddress.id)
      ).resolves.toBeUndefined()
    })
  })

  describe('Update Wallet Address', (): void => {
    test.each`
      initialIsActive | status        | expectedIsActive
      ${true}         | ${undefined}  | ${true}
      ${true}         | ${'INACTIVE'} | ${false}
      ${false}        | ${'ACTIVE'}   | ${true}
      ${false}        | ${undefined}  | ${false}
    `(
      'Wallet address with initial isActive of $initialIsActive can be updated with $status status ',
      async ({ initialIsActive, status, expectedIsActive }): Promise<void> => {
        const walletAddress = await createWalletAddress(deps)

        if (!initialIsActive) {
          await walletAddress.$query(knex).patch({ deactivatedAt: new Date() })
        }

        const updatedWalletAddress = await walletAddressService.update({
          id: walletAddress.id,
          status
        })
        assert.ok(!isWalletAddressError(updatedWalletAddress))

        expect(updatedWalletAddress.isActive).toEqual(expectedIsActive)

        await expect(
          walletAddressService.get(walletAddress.id)
        ).resolves.toEqual(updatedWalletAddress)
      }
    )

    test('publicName', async (): Promise<void> => {
      const walletAddress = await createWalletAddress(deps, {
        publicName: 'Initial Name'
      })
      const newName = 'New Name'
      const updatedWalletAddress = await walletAddressService.update({
        id: walletAddress.id,
        publicName: newName
      })
      assert.ok(!isWalletAddressError(updatedWalletAddress))
      expect(updatedWalletAddress.deactivatedAt).toEqual(null)
      expect(updatedWalletAddress.publicName).toEqual(newName)
      await expect(
        walletAddressService.get(walletAddress.id)
      ).resolves.toEqual(updatedWalletAddress)
    })

    describe('Deactivating wallet address', (): void => {
      test(
        'Updates expiry dates of related incoming payments',
        withConfigOverride(
          () => config,
          {
            walletAddressDeactivationPaymentGracePeriodMs: 2592000000,
            incomingPaymentExpiryMaxMs: 2592000000 * 3
          },
          async (): Promise<void> => {
            const walletAddress = await createWalletAddress(deps)
            const now = new Date('2023-06-01T00:00:00Z').getTime()
            jest.useFakeTimers({ now })

            const duration =
              config.walletAddressDeactivationPaymentGracePeriodMs + 10_000
            const expiresAt = new Date(Date.now() + duration)

            const incomingPayment = await createIncomingPayment(deps, {
              walletAddressId: walletAddress.id,
              incomingAmount: {
                value: BigInt(123),
                assetCode: walletAddress.asset.code,
                assetScale: walletAddress.asset.scale
              },
              expiresAt,
              metadata: {
                description: 'Test incoming payment',
                externalRef: '#123'
              }
            })

            await walletAddressService.update({
              id: walletAddress.id,
              status: 'INACTIVE'
            })
            const incomingPaymentUpdated = await incomingPayment.$query(knex)

            expect(incomingPaymentUpdated.expiresAt.getTime()).toEqual(
              expiresAt.getTime() +
                config.walletAddressDeactivationPaymentGracePeriodMs -
                duration
            )
          }
        )
      )

      test(
        'Does not update expiry dates of related incoming payments when new expiry is greater',
        withConfigOverride(
          () => config,
          { walletAddressDeactivationPaymentGracePeriodMs: 2592000000 },
          async (): Promise<void> => {
            const walletAddress = await createWalletAddress(deps)
            const now = new Date('2023-06-01T00:00:00Z').getTime()
            jest.useFakeTimers({ now })

            const duration = 30_000
            const expiresAt = new Date(Date.now() + duration)

            const incomingPayment = await createIncomingPayment(deps, {
              walletAddressId: walletAddress.id,
              incomingAmount: {
                value: BigInt(123),
                assetCode: walletAddress.asset.code,
                assetScale: walletAddress.asset.scale
              },
              expiresAt,
              metadata: {
                description: 'Test incoming payment',
                externalRef: '#123'
              }
            })

            await walletAddressService.update({
              id: walletAddress.id,
              status: 'INACTIVE'
            })
            const incomingPaymentUpdated = await incomingPayment.$query(knex)

            expect(incomingPaymentUpdated.expiresAt).toEqual(expiresAt)
          }
        )
      )
    })

    test('Cannot update unknown wallet address', async (): Promise<void> => {
      await expect(
        walletAddressService.update({
          id: uuid(),
          status: 'INACTIVE',
          publicName: 'Some Public Name'
        })
      ).resolves.toEqual(WalletAddressError.UnknownWalletAddress)
    })
  })

  describe('Get Wallet Address By Url', (): void => {
    test('can retrieve wallet address by url', async (): Promise<void> => {
      const walletAddress = await createWalletAddress(deps)
      await expect(
        walletAddressService.getByUrl(walletAddress.url)
      ).resolves.toEqual(walletAddress)

      await expect(
        walletAddressService.getByUrl(walletAddress.url + '/path')
      ).resolves.toBeUndefined()

      await expect(
        walletAddressService.getByUrl('prefix+' + walletAddress.url)
      ).resolves.toBeUndefined()
    })

    test(
      'returns undefined if no wallet address exists with url',
      withConfigOverride(
        () => config,
        { walletAddressLookupTimeoutMs: 1 },
        async (): Promise<void> => {
          await expect(
            walletAddressService.getByUrl('test.nope')
          ).resolves.toBeUndefined()
        }
      )
    )
  })

  describe('Get Or Poll Wallet Addres By Url', (): void => {
    describe('existing wallet address', (): void => {
      test('can retrieve wallet address by url', async (): Promise<void> => {
        const walletAddress = await createWalletAddress(deps)
        await expect(
          walletAddressService.getOrPollByUrl(walletAddress.url)
        ).resolves.toEqual(walletAddress)
      })
    })

    describe('non-existing wallet address', (): void => {
      test(
        'creates wallet address not found event',
        withConfigOverride(
          () => config,
          { walletAddressLookupTimeoutMs: 0 },
          async (): Promise<void> => {
            const walletAddressUrl = `https://${faker.internet.domainName()}/.well-known/pay`
            await expect(
              walletAddressService.getOrPollByUrl(walletAddressUrl)
            ).resolves.toBeUndefined()

            const walletAddressNotFoundEvents =
              await WalletAddressEvent.query(knex).where({
                type: WalletAddressEventType.WalletAddressNotFound
              })

            expect(walletAddressNotFoundEvents[0]).toMatchObject({
              data: { walletAddressUrl }
            })
          }
        )
      )

      test(
        'polls for wallet address',
        withConfigOverride(
          () => config,
          { walletAddressPollingFrequencyMs: 10 },
          async (): Promise<void> => {
            const walletAddressUrl = `https://${faker.internet.domainName()}/.well-known/pay`

            const [getOrPollByUrlWalletAddress, createdWalletAddress] =
              await Promise.all([
                walletAddressService.getOrPollByUrl(walletAddressUrl),
                (async () => {
                  await sleep(5)
                  return createWalletAddress(deps, {
                    url: walletAddressUrl
                  })
                })()
              ])

            assert.ok(getOrPollByUrlWalletAddress)
            expect(getOrPollByUrlWalletAddress).toEqual(createdWalletAddress)
          }
        )
      )

      test(
        'returns undefined if no wallet address exists with url',
        withConfigOverride(
          () => config,
          { walletAddressLookupTimeoutMs: 1 },
          async (): Promise<void> => {
            await expect(
              walletAddressService.getByUrl('test.nope')
            ).resolves.toBeUndefined()
          }
        )
      )
    })
  })

  describe('Wallet Address pagination', (): void => {
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
        const walletAddressIds: string[] = []
        for (let i = 0; i < num; i++) {
          const walletAddress = await createWalletAddress(deps)
          walletAddressIds.push(walletAddress.id)
        }
        if (cursor) {
          if (pagination.last) pagination.before = walletAddressIds[cursor]
          else pagination.after = walletAddressIds[cursor]
        }
        const page = await walletAddressService.getPage(pagination)
        const pageInfo = await getPageInfo(
          (pagination) => walletAddressService.getPage(pagination),
          page
        )
        expect(pageInfo).toEqual({
          startCursor: walletAddressIds[start],
          endCursor: walletAddressIds[end],
          hasNextPage,
          hasPreviousPage
        })
      }
    )
    describe('getPage', (): void => {
      getPageTests({
        createModel: () => createWalletAddress(deps),
        getPage: (pagination?: Pagination) =>
          walletAddressService.getPage(pagination)
      })
    })
  })

  describe('onCredit', (): void => {
    let walletAddress: WalletAddress

    beforeEach(async (): Promise<void> => {
      walletAddress = await createWalletAddress(deps)
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
              await walletAddress.asset.$query(knex).patch({
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
                  await walletAddress.$query(knex).patch({
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
                      await walletAddress.$query(knex).patch({
                        totalEventsAmount
                      })
                    })
                    if (withdrawalThreshold !== BigInt(0)) {
                      test("Balance doesn't meet withdrawal threshold", async (): Promise<void> => {
                        await expect(
                          walletAddress.onCredit({
                            totalReceived: totalEventsAmount + BigInt(1),
                            withdrawalThrottleDelay
                          })
                        ).resolves.toMatchObject({
                          processAt: startingProcessAt || delayProcessAt
                        })
                        await expect(
                          walletAddressService.get(walletAddress.id)
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
                            walletAddress.onCredit({
                              totalReceived
                            })
                          ).resolves.toMatchObject({
                            processAt: thresholdProcessAt
                          })
                          await expect(
                            walletAddressService.get(walletAddress.id)
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
    let walletAddress: WalletAddress

    beforeEach(async (): Promise<void> => {
      walletAddress = await createWalletAddress(deps, {
        createLiquidityAccount: true
      })
    })

    test.each`
      processAt                        | description
      ${null}                          | ${'not scheduled'}
      ${new Date(Date.now() + 60_000)} | ${'not ready'}
    `(
      'Does not process wallet address $description for withdrawal',
      async ({ processAt }): Promise<void> => {
        await walletAddress.$query(knex).patch({ processAt })
        await expect(
          walletAddressService.processNext()
        ).resolves.toBeUndefined()
        await expect(
          walletAddressService.get(walletAddress.id)
        ).resolves.toEqual(walletAddress)
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
            account: walletAddress,
            amount: totalReceived
          })
        ).resolves.toBeUndefined()
        await walletAddress.$query(knex).patch({
          processAt: new Date(),
          totalEventsAmount
        })
        await expect(walletAddressService.processNext()).resolves.toBe(
          walletAddress.id
        )
        await expect(
          walletAddressService.get(walletAddress.id)
        ).resolves.toMatchObject({
          processAt: null,
          totalEventsAmount: totalEventsAmount + withdrawalAmount
        })
        await expect(
          WalletAddressEvent.query(knex).where({
            type: WalletAddressEventType.WalletAddressWebMonetization,
            withdrawalAccountId: walletAddress.id,
            withdrawalAssetId: walletAddress.assetId,
            withdrawalAmount
          })
        ).resolves.toHaveLength(1)
      }
    )
  })

  describe('triggerEvents', (): void => {
    let walletAddresses: WalletAddress[]

    beforeEach(async (): Promise<void> => {
      const { id: assetId } = await createAsset(deps)
      walletAddresses = []
      for (let i = 0; i < 5; i++) {
        walletAddresses.push(
          await createWalletAddress(deps, {
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
      'Does not process wallet address $description for withdrawal',
      async ({ processAt }): Promise<void> => {
        for (let i = 1; i < walletAddresses.length; i++) {
          await walletAddresses[i].$query(knex).patch({ processAt })
        }
        await expect(walletAddressService.triggerEvents(10)).resolves.toEqual(
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
        for (let i = 1; i < walletAddresses.length; i++) {
          await expect(
            accountingService.createDeposit({
              id: uuid(),
              account: walletAddresses[i],
              amount: withdrawalAmount
            })
          ).resolves.toBeUndefined()
          await walletAddresses[i].$query(knex).patch({
            processAt: new Date()
          })
        }
        await expect(walletAddressService.triggerEvents(limit)).resolves.toBe(
          count
        )
        await expect(
          WalletAddressEvent.query(knex).where({
            type: WalletAddressEventType.WalletAddressWebMonetization
          })
        ).resolves.toHaveLength(count)
        for (let i = 1; i <= count; i++) {
          await expect(
            walletAddressService.get(walletAddresses[i].id)
          ).resolves.toMatchObject({
            processAt: null,
            totalEventsAmount: withdrawalAmount
          })
        }
        for (let i = count + 1; i < walletAddresses.length; i++) {
          await expect(
            walletAddressService.get(walletAddresses[i].id)
          ).resolves.toEqual(walletAddresses[i])
        }
      }
    )
  })
})
