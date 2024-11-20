import assert from 'assert'
import { Knex } from 'knex'
import { v4 as uuid } from 'uuid'

import { isWalletAddressError, WalletAddressError } from './errors'
import {
  WalletAddress,
  WalletAddressEvent,
  WalletAddressEventType
} from './model'
import { CreateOptions, FORBIDDEN_PATHS, WalletAddressService } from './service'
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
import { getPageTests } from '../../shared/baseModel.test'
import { Pagination, SortOrder } from '../../shared/baseModel'
import { sleep } from '../../shared/utils'
import { withConfigOverride } from '../../tests/helpers'
import { WalletAddressAdditionalProperty } from './additional_property/model'

describe('Open Payments Wallet Address Service using Cache', (): void => {
  let deps: IocContract<AppServices>
  let config: IAppConfig
  let appContainer: TestContainer
  let walletAddressService: WalletAddressService
  let knex: Knex

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer({
      ...Config,
      localCacheDuration: 5_000// 5-second default.
    })
    config = await deps.use('config')
    appContainer = await createTestApp(deps)
    knex = appContainer.knex
    walletAddressService = await deps.use('walletAddressService')
  })

  afterEach(async (): Promise<void> => {
    jest.useRealTimers()
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('Create or Get Wallet Address with cache', (): void => {
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
  })

  describe('Update Wallet Address with cache', (): void => {
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
          // Update through the service, will also update the wallet-address cache:
          await walletAddressService.update({ id: walletAddress.id, status: 'INACTIVE' })
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
      await expect(walletAddressService.get(walletAddress.id)).resolves.toEqual(
        updatedWalletAddress
      )
    })

    describe('Deactivating wallet address with cache', (): void => {
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

  describe('Wallet Address pagination with cache', (): void => {
    describe('getPage', (): void => {
      getPageTests({
        createModel: () => createWalletAddress(deps),
        getPage: (pagination?: Pagination, sortOrder?: SortOrder) =>
          walletAddressService.getPage(pagination, sortOrder)
      })
    })
  })

  describe('onCredit with cache', (): void => {
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
          jest.useFakeTimers({ now: Date.now() })
          if (withdrawalThrottleDelay !== undefined) {
            delayProcessAt = new Date(Date.now() + withdrawalThrottleDelay)
          }
        })
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
  })
})
