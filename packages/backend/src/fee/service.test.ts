import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../app'
import { TestContainer, createTestApp } from '../tests/app'
import { initIocContainer } from '..'
import { Config } from '../config/app'
import { FeeService } from './service'
import { Knex } from 'knex'
import { truncateTables } from '../tests/tableManager'
import { createAsset } from '../tests/asset'
import { Asset } from '../asset/model'
import { Fee, FeeType } from './model'
import { v4 } from 'uuid'
import { FeeError } from './errors'

describe('Combined Payment Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let feeService: FeeService
  let asset: Asset

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    knex = appContainer.knex
    feeService = await deps.use('feeService')
  })

  beforeEach(async (): Promise<void> => {
    asset = await createAsset(deps)
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('Fee Service', (): void => {
    describe('create', (): void => {
      type ValidFeeCases = { percentage: number; fixed: bigint }
      const validFeeCases: ValidFeeCases[] = [
        { fixed: BigInt(1), percentage: 0 },
        { fixed: BigInt(1), percentage: 0.00004 }, // will round to 0
        { fixed: BigInt(100), percentage: 0.00005 }, // will round to 0.0001
        { fixed: BigInt(1), percentage: 0.0 },
        { fixed: BigInt(100), percentage: 0.05 },
        { fixed: BigInt(100), percentage: 1.0 }
      ]
      test.each(validFeeCases)(
        'Can create with fixed: $fixed and percentage: $percentage',
        async ({ percentage, fixed }): Promise<void> => {
          const feeCreate = {
            assetId: asset.id,
            type: FeeType.Sending,
            fee: {
              fixed,
              percentage
            }
          }

          await expect(feeService.create(feeCreate)).resolves.toMatchObject({
            assetId: feeCreate.assetId,
            type: feeCreate.type,
            fixedFee: feeCreate.fee.fixed,
            percentageFee: feeCreate.fee.percentage.toFixed(4),
            activatedAt: expect.any(Date)
          })
        }
      )

      type InvalidFeeCases = {
        percentage: number
        fixed: bigint
        error: FeeError
        description: string
      }
      const invalidFeeCases: InvalidFeeCases[] = [
        {
          fixed: BigInt(100),
          percentage: 1.01,
          error: FeeError.InvalidPercentageFee,
          description: 'Cant create with over 100% fee'
        },
        {
          fixed: BigInt(100),
          percentage: -0.05,
          error: FeeError.InvalidPercentageFee,
          description: 'Cant create with less than 0% fee'
        },
        {
          fixed: BigInt(-100),
          percentage: 0.05,
          error: FeeError.InvalidFixedFee,
          description: 'Cant create with less than 0 fixed fee'
        },
        {
          fixed: BigInt(0),
          percentage: 0.00004, // will round to 0
          error: FeeError.MissingFee,
          description: 'Cant create with both fixed and percentage fee of 0'
        }
      ]
      test.each(invalidFeeCases)(
        '$description',
        async ({ percentage, fixed, error }): Promise<void> => {
          const feeCreate = {
            assetId: asset.id,
            type: FeeType.Sending,
            fee: {
              fixed,
              percentage
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
            percentage: 0.05
          }
        }

        await expect(feeService.create(feeCreate)).resolves.toEqual(
          FeeError.UnknownAsset
        )
      })
    })

    describe('getLatestFee', (): void => {
      it('should return the latest fee for the given asset', async (): Promise<void> => {
        await Fee.query().insertAndFetch({
          assetId: asset.id,
          type: FeeType.Receiving,
          percentageFee: '0.01',
          fixedFee: BigInt(100),
          activatedAt: new Date()
        })
        const fee2 = await Fee.query().insertAndFetch({
          assetId: asset.id,
          type: FeeType.Receiving,
          percentageFee: '0.02',
          fixedFee: BigInt(200),
          activatedAt: new Date()
        })

        const latestFee = await feeService.getLatestFee(asset.id)
        expect(latestFee).toEqual(fee2)
      })

      it('should return undefined if no fees exist for the given asset', async (): Promise<void> => {
        const latestFee = await feeService.getLatestFee(v4())
        expect(latestFee).toBeUndefined()
      })

      it('should return undefined if no fee exists', async (): Promise<void> => {
        const latestFee = await feeService.getLatestFee(asset.id)
        expect(latestFee).toBeUndefined()
      })
    })
  })
})
