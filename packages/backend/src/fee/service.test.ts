import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../app'
import { TestContainer, createTestApp } from '../tests/app'
import { initIocContainer } from '..'
import { Config } from '../config/app'
import { FeeService } from './service'
import { truncateTables } from '../tests/tableManager'
import { createAsset } from '../tests/asset'
import { Asset } from '../asset/model'
import { Fee, FeeType } from './model'
import { v4 } from 'uuid'
import { FeeError } from './errors'
import { getPageTests } from '../shared/baseModel.test'
import { createFee } from '../tests/fee'
import { Pagination, SortOrder } from '../shared/baseModel'

describe('Fee Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let feeService: FeeService
  let asset: Asset

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    feeService = await deps.use('feeService')
  })

  beforeEach(async (): Promise<void> => {
    asset = await createAsset(deps)
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(deps)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('Fee Service', (): void => {
    describe('create', (): void => {
      type ValidFeeCases = { basisPoints: number; fixed: bigint }
      const validFeeCases: ValidFeeCases[] = [
        { fixed: BigInt(0), basisPoints: 0 },
        { fixed: BigInt(1), basisPoints: 0 },
        { fixed: BigInt(1), basisPoints: 1 },
        { fixed: BigInt(100), basisPoints: 500 },
        { fixed: BigInt(100), basisPoints: 10_000 }
      ]
      test.each(validFeeCases)(
        'Can create with fixed: $fixed and basisPoints: $basisPoints',
        async ({ basisPoints, fixed }): Promise<void> => {
          const feeCreate = {
            assetId: asset.id,
            type: FeeType.Sending,
            fee: {
              fixed,
              basisPoints
            }
          }

          await expect(feeService.create(feeCreate)).resolves.toMatchObject({
            assetId: feeCreate.assetId,
            type: feeCreate.type,
            fixedFee: feeCreate.fee.fixed,
            basisPointFee: feeCreate.fee.basisPoints,
            createdAt: expect.any(Date)
          })
        }
      )

      type InvalidFeeCases = {
        basisPoints: number
        fixed: bigint
        error: FeeError
        description: string
      }
      const invalidFeeCases: InvalidFeeCases[] = [
        {
          fixed: BigInt(100),
          basisPoints: 10_001,
          error: FeeError.InvalidBasisPointFee,
          description: 'Cant create with over 10000 basis point fee'
        },
        {
          fixed: BigInt(100),
          basisPoints: -500,
          error: FeeError.InvalidBasisPointFee,
          description: 'Cant create with less than 0 basis point fee'
        },
        {
          fixed: BigInt(-100),
          basisPoints: 500,
          error: FeeError.InvalidFixedFee,
          description: 'Cant create with less than 0 fixed fee'
        }
      ]
      test.each(invalidFeeCases)(
        '$description',
        async ({ basisPoints, fixed, error }): Promise<void> => {
          const feeCreate = {
            assetId: asset.id,
            type: FeeType.Sending,
            fee: {
              fixed,
              basisPoints
            }
          }

          await expect(feeService.create(feeCreate)).resolves.toEqual(error)
        }
      )

      test('Cant create for unknown asset id', async (): Promise<void> => {
        const feeCreate = {
          assetId: v4(),
          type: FeeType.Sending,
          fee: {
            fixed: BigInt(100),
            basisPoints: 500
          }
        }

        await expect(feeService.create(feeCreate)).resolves.toEqual(
          FeeError.UnknownAsset
        )
      })
    })

    describe('getLatestFee', (): void => {
      it('should return the latest fee for the given asset', async (): Promise<void> => {
        const type = FeeType.Receiving
        await Fee.query().insertAndFetch({
          assetId: asset.id,
          type,
          basisPointFee: 100,
          fixedFee: BigInt(100)
        })
        const fee2 = await Fee.query().insertAndFetch({
          assetId: asset.id,
          type,
          basisPointFee: 200,
          fixedFee: BigInt(200)
        })

        const latestFee = await feeService.getLatestFee(asset.id, type)
        expect(latestFee).toEqual(fee2)
      })

      it('should return undefined if no fees exist for the given asset', async (): Promise<void> => {
        const latestFee = await feeService.getLatestFee(v4(), FeeType.Sending)
        expect(latestFee).toBeUndefined()
      })
    })

    describe('Fee pagination', (): void => {
      getPageTests({
        createModel: () => createFee(deps, asset.id),
        getPage: (pagination?: Pagination, sortOrder?: SortOrder) =>
          feeService.getPage(asset.id, pagination, sortOrder)
      })
    })
  })
})
