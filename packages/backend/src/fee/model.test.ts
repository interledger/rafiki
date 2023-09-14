import { Knex } from 'knex'
import { Config } from '../config/app'
import { createTestApp, TestContainer } from '../tests/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'
import { createAsset } from '../tests/asset'
import { truncateTables } from '../tests/tableManager'
import { Asset } from '../asset/model'
import { Fee, FeeType } from './model'

describe('Fee Model', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let asset: Asset

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    knex = await deps.use('knex')
  })

  beforeEach(async (): Promise<void> => {
    asset = await createAsset(deps)
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(appContainer.knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('calculate', (): void => {
    test.each`
      principal | fixedFee | basisPointFee | expectedResult
      ${100n}   | ${0n}    | ${0}          | ${0n}
      ${100n}   | ${10n}   | ${0}          | ${10n}
      ${100n}   | ${0n}    | ${100}        | ${1n}
      ${100n}   | ${10n}   | ${100}        | ${11n}
    `(
      'A fee of $fixedFee fixed and $basisPointFee results in $expectedResult for an amount of $principal',
      async ({
        principal,
        fixedFee,
        basisPointFee,
        expectedResult
      }): Promise<void> => {
        const fee = await Fee.query().insertAndFetch({
          assetId: asset.id,
          type: FeeType.Sending,
          basisPointFee,
          fixedFee
        })
        const result = fee.calculate(principal)
        console.log(result)
        expect(fee.calculate(principal)).toEqual(expectedResult)
      }
    )
  })
})
