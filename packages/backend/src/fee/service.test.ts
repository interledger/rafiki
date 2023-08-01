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
import { FeeType } from './model'
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
    test.each([0.01, 0.05, 1.0])(
      'Can create fee with percentageFee of %',
      async (): Promise<void> => {
        const feeCreate = {
          assetId: asset.id,
          type: FeeType.Sending,
          fee: {
            fixed: BigInt(100),
            percentage: 0.01
          }
        }

        await expect(feeService.create(feeCreate)).resolves.toMatchObject({
          assetId: feeCreate.assetId,
          type: feeCreate.type,
          fixedFee: feeCreate.fee.fixed,
          percentageFee: feeCreate.fee.percentage.toFixed(4)
        })
      }
    )

    test('Cant create with over 100% fee', async (): Promise<void> => {
      const feeCreate = {
        assetId: asset.id,
        type: FeeType.Sending,
        fee: {
          fixed: BigInt(100),
          percentage: 1.01
        }
      }

      await expect(feeService.create(feeCreate)).resolves.toEqual(
        FeeError.InvalidFee
      )
    })

    test('Cant create with less than 0% fee', async (): Promise<void> => {
      const feeCreate = {
        assetId: asset.id,
        type: FeeType.Sending,
        fee: {
          fixed: BigInt(100),
          percentage: -0.05
        }
      }

      await expect(feeService.create(feeCreate)).resolves.toEqual(
        FeeError.InvalidFee
      )
    })

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
})
