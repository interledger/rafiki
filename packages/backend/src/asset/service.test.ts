import assert from 'assert'
import { v4 as uuid } from 'uuid'
import { faker } from '@faker-js/faker'

import { AssetError, isAssetError } from './errors'
import { AssetService } from './service'
import { Asset } from './model'
import { Pagination, SortOrder } from '../shared/baseModel'
import { getPageTests } from '../shared/baseModel.test'
import { createTestApp, TestContainer } from '../tests/app'
import { createAsset, randomAsset } from '../tests/asset'
import { truncateTables } from '../tests/tableManager'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'
import { LiquidityAccountType } from '../accounting/service'
import { CheckViolationError } from 'objection'
import { WalletAddressService } from '../open_payments/wallet_address/service'
import { isWalletAddressError } from '../open_payments/wallet_address/errors'
import { PeerService } from '../payment-method/ilp/peer/service'
import { isPeerError } from '../payment-method/ilp/peer/errors'

describe('Asset Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let assetService: AssetService
  let peerService: PeerService
  let walletAddressService: WalletAddressService

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    assetService = await deps.use('assetService')
    walletAddressService = await deps.use('walletAddressService')
    peerService = await deps.use('peerService')
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(appContainer.knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('create', (): void => {
    test.each`
      withdrawalThreshold | liquidityThresholdLow | liquidityThresholdHigh
      ${undefined}        | ${undefined}          | ${undefined}
      ${undefined}        | ${undefined}          | ${BigInt(500)}
      ${undefined}        | ${BigInt(5)}          | ${undefined}
      ${undefined}        | ${BigInt(5)}          | ${BigInt(500)}
      ${BigInt(5)}        | ${undefined}          | ${undefined}
      ${BigInt(5)}        | ${undefined}          | ${BigInt(500)}
      ${BigInt(5)}        | ${BigInt(5)}          | ${undefined}
      ${BigInt(5)}        | ${BigInt(5)}          | ${BigInt(500)}
    `(
      'Asset can be created and fetched',
      async ({
        withdrawalThreshold,
        liquidityThresholdLow,
        liquidityThresholdHigh
      }): Promise<void> => {
        const options = {
          ...randomAsset(),
          withdrawalThreshold,
          liquidityThresholdLow,
          liquidityThresholdHigh
        }
        const asset = await assetService.create(options)
        assert.ok(!isAssetError(asset))
        expect(asset).toMatchObject({
          ...options,
          id: asset.id,
          ledger: asset.ledger,
          withdrawalThreshold: withdrawalThreshold || null,
          liquidityThresholdLow: liquidityThresholdLow || null,
          liquidityThresholdHigh: liquidityThresholdHigh || null
        })
        await expect(assetService.get(asset.id)).resolves.toEqual(asset)
      }
    )

    test('Asset accounts are created', async (): Promise<void> => {
      const accountingService = await deps.use('accountingService')
      const liquidityAndSettlementSpy = jest.spyOn(
        accountingService,
        'createLiquidityAndLinkedSettlementAccount'
      )

      const asset = await assetService.create(randomAsset())
      assert.ok(!isAssetError(asset))

      expect(liquidityAndSettlementSpy).toHaveBeenCalledWith(
        asset,
        LiquidityAccountType.ASSET,
        expect.any(Function)
      )

      await expect(accountingService.getBalance(asset.id)).resolves.toEqual(
        BigInt(0)
      )
      await expect(
        accountingService.getSettlementBalance(asset.ledger)
      ).resolves.toEqual(BigInt(0))
    })

    test('Asset can be created with minimum account withdrawal amount', async (): Promise<void> => {
      const options = {
        ...randomAsset(),
        withdrawalThreshold: BigInt(10)
      }
      const asset = await assetService.create(options)
      assert.ok(!isAssetError(asset))
      expect(asset).toMatchObject({
        ...options,
        id: asset.id,
        ledger: asset.ledger
      })
      await expect(assetService.get(asset.id)).resolves.toEqual(asset)
    })

    test('Cannot create duplicate asset', async (): Promise<void> => {
      const options = randomAsset()
      await expect(assetService.create(options)).resolves.toMatchObject(options)
      await expect(assetService.create(options)).resolves.toEqual(
        AssetError.DuplicateAsset
      )
    })

    test('Cannot create asset with scale > 255', async (): Promise<void> => {
      const options = {
        code: 'ABC',
        scale: 256
      }
      await expect(assetService.create(options)).rejects.toThrow(
        CheckViolationError
      )
    })
  })

  describe('get', (): void => {
    test('Can get asset by id', async (): Promise<void> => {
      const asset = await assetService.create(randomAsset())
      assert.ok(!isAssetError(asset))
      await expect(assetService.get(asset.id)).resolves.toEqual(asset)
    })

    test('Cannot get unknown asset', async (): Promise<void> => {
      await expect(assetService.get(uuid())).resolves.toBeUndefined()
    })
  })

  describe('update', (): void => {
    describe.each`
      withdrawalThreshold | liquidityThresholdLow | liquidityThresholdHigh
      ${null}             | ${null}               | ${null}
      ${null}             | ${null}               | ${BigInt(500)}
      ${null}             | ${BigInt(5)}          | ${null}
      ${null}             | ${BigInt(5)}          | ${BigInt(500)}
      ${BigInt(0)}        | ${null}               | ${null}
      ${BigInt(0)}        | ${null}               | ${BigInt(500)}
      ${BigInt(0)}        | ${BigInt(5)}          | ${null}
      ${BigInt(0)}        | ${BigInt(5)}          | ${BigInt(500)}
      ${BigInt(5)}        | ${null}               | ${null}
      ${BigInt(5)}        | ${null}               | ${BigInt(500)}
      ${BigInt(5)}        | ${BigInt(5)}          | ${null}
      ${BigInt(5)}        | ${BigInt(5)}          | ${BigInt(500)}
    `(
      'Asset threshold can be updated from withdrawalThreshold: $withdrawalThreshold, liquidityThresholdLow: $liquidityThresholdLow, liquidityThresholdHigh: $liquidityThresholdHigh',
      ({
        withdrawalThreshold,
        liquidityThresholdLow,
        liquidityThresholdHigh
      }): void => {
        let assetId: string

        beforeEach(async (): Promise<void> => {
          const asset = await assetService.create({
            ...randomAsset(),
            withdrawalThreshold,
            liquidityThresholdLow,
            liquidityThresholdHigh
          })
          assert.ok(!isAssetError(asset))
          expect(asset.withdrawalThreshold).toEqual(withdrawalThreshold)
          assetId = asset.id
        })

        test.each`
          withdrawalThreshold | liquidityThresholdLow | liquidityThresholdHigh
          ${null}             | ${null}               | ${null}
          ${null}             | ${null}               | ${BigInt(500)}
          ${null}             | ${BigInt(5)}          | ${null}
          ${null}             | ${BigInt(5)}          | ${BigInt(500)}
          ${BigInt(0)}        | ${null}               | ${null}
          ${BigInt(0)}        | ${null}               | ${BigInt(500)}
          ${BigInt(0)}        | ${BigInt(5)}          | ${null}
          ${BigInt(0)}        | ${BigInt(5)}          | ${BigInt(500)}
          ${BigInt(5)}        | ${null}               | ${null}
          ${BigInt(5)}        | ${null}               | ${BigInt(500)}
          ${BigInt(5)}        | ${BigInt(5)}          | ${null}
          ${BigInt(5)}        | ${BigInt(5)}          | ${BigInt(500)}
        `(
          'to withdrawalThreshold: $withdrawalThreshold, liquidityThresholdLow: $liquidityThresholdLow, liquidityThresholdHigh: $liquidityThresholdHigh',
          async ({
            withdrawalThreshold,
            liquidityThresholdLow,
            liquidityThresholdHigh
          }): Promise<void> => {
            const asset = await assetService.update({
              id: assetId,
              withdrawalThreshold,
              liquidityThresholdLow,
              liquidityThresholdHigh
            })
            assert.ok(!isAssetError(asset))
            expect(asset.withdrawalThreshold).toEqual(withdrawalThreshold)
            expect(asset.liquidityThresholdLow).toEqual(liquidityThresholdLow)
            expect(asset.liquidityThresholdHigh).toEqual(liquidityThresholdHigh)
            await expect(assetService.get(assetId)).resolves.toEqual(asset)
          }
        )
      }
    )

    test('Cannot update unknown asset', async (): Promise<void> => {
      await expect(
        assetService.update({
          id: uuid(),
          withdrawalThreshold: BigInt(10),
          liquidityThresholdLow: null
        })
      ).resolves.toEqual(AssetError.UnknownAsset)
    })
  })

  describe('getPage', (): void => {
    getPageTests({
      createModel: () => createAsset(deps),
      getPage: (pagination?: Pagination, sortOrder?: SortOrder) =>
        assetService.getPage(pagination, sortOrder)
    })
  })

  describe('getAll', (): void => {
    test('returns all assets', async (): Promise<void> => {
      const assets: (Asset | AssetError)[] = []
      for (let i = 0; i < 3; i++) {
        const asset = await assetService.create(randomAsset())
        assets.push(asset)
      }

      await expect(assetService.getAll()).resolves.toEqual(assets)
    })

    test('returns empty array if no assets', async (): Promise<void> => {
      await expect(assetService.getAll()).resolves.toEqual([])
    })
  })

  describe('delete', (): void => {
    test('Can delete asset', async (): Promise<void> => {
      const newAsset = await assetService.create(randomAsset())
      assert.ok(!isAssetError(newAsset))
      const newAssetId = newAsset.id

      const deletedAsset = await assetService.delete({
        id: newAssetId,
        deletedAt: new Date()
      })
      assert.ok(!isAssetError(deletedAsset))
      expect(deletedAsset.deletedAt).not.toBeNull()
    })

    test('Can delete and restore asset', async (): Promise<void> => {
      const newAsset = await assetService.create(randomAsset())
      assert.ok(!isAssetError(newAsset))
      const newAssetId = newAsset.id
      const { code, scale } = newAsset

      const deletedAsset = await assetService.delete({
        id: newAssetId,
        deletedAt: new Date()
      })
      assert.ok(!isAssetError(deletedAsset))

      const restoredAsset = await assetService.create({ code, scale })
      assert.ok(!isAssetError(restoredAsset))
      expect(restoredAsset.id).toEqual(newAssetId)
      expect(restoredAsset.code).toEqual(code)
      expect(restoredAsset.scale).toEqual(scale)
      expect(restoredAsset.deletedAt).toBeNull()
    })

    test('Cannot delete in use asset (wallet)', async (): Promise<void> => {
      const newAsset = await assetService.create(randomAsset())
      assert.ok(!isAssetError(newAsset))
      const newAssetId = newAsset.id

      // make sure there is at least 1 wallet address using asset
      const walletAddress = walletAddressService.create({
        url: 'https://alice.me/.well-known/pay',
        assetId: newAssetId
      })
      assert.ok(!isWalletAddressError(walletAddress))

      await expect(
        assetService.delete({ id: newAssetId, deletedAt: new Date() })
      ).resolves.toEqual(AssetError.CannotDeleteInUseAsset)
    })

    test('Cannot delete in use asset (peer)', async (): Promise<void> => {
      const newAsset = await assetService.create(randomAsset())
      assert.ok(!isAssetError(newAsset))
      const newAssetId = newAsset.id

      // make sure there is at least 1 peer using asset
      const options = {
        assetId: newAssetId,
        http: {
          incoming: {
            authTokens: [faker.string.sample(32)]
          },
          outgoing: {
            authToken: faker.string.sample(32),
            endpoint: faker.internet.url({ appendSlash: false })
          }
        },
        maxPacketAmount: BigInt(100),
        staticIlpAddress: 'test.' + uuid(),
        name: faker.person.fullName(),
        liquidityThresholdLow: BigInt(100),
        liquidityThresholdHigh: BigInt(1000)
      }
      const peer = await peerService.create(options)
      assert.ok(!isPeerError(peer))

      await expect(
        assetService.delete({ id: newAssetId, deletedAt: new Date() })
      ).resolves.toEqual(AssetError.CannotDeleteInUseAsset)
    })
  })
})
