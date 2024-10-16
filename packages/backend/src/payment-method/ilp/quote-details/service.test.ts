import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../../app'
import { TestContainer, createTestApp } from '../../../tests/app'
import { initIocContainer } from '../../../'
import { Config } from '../../../config/app'
import { Knex } from 'knex'
import { truncateTables } from '../../../tests/tableManager'
import { createAsset } from '../../../tests/asset'
import { v4 } from 'uuid'
import { IlpQuoteDetailsService } from './service'
import { createQuote } from '../../../tests/quote'
import { createWalletAddress } from '../../../tests/walletAddress'

describe('IlpQuoteDetails Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let ilpQuoteDetailsService: IlpQuoteDetailsService

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    knex = await deps.use('knex')
    ilpQuoteDetailsService = await deps.use('ilpQuoteDetailsService')
  })
  afterEach(async (): Promise<void> => {
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('IlpQuoteDetails Service', (): void => {
    describe('getById', (): void => {
      it('should get ILP quote by id', async (): Promise<void> => {
        const asset = await createAsset(deps)
        const { id: walletAddressId } = await createWalletAddress(deps, {
          assetId: asset.id
        })

        const quote = await createQuote(deps, {
          walletAddressId,
          receiver: `http://wallet2.example/bob/incoming-payments/${v4()}`,
          debitAmount: {
            value: BigInt(56),
            assetCode: asset.code,
            assetScale: asset.scale
          },
          method: 'ilp',
          validDestination: false
        })

        const foundIlpQuote = await ilpQuoteDetailsService.getByQuoteId(
          quote.id
        )
        expect(foundIlpQuote).toBeDefined()
      })

      it('should return undefined when no ILP quote is found by id', async (): Promise<void> => {
        const foundIlpQuote = await ilpQuoteDetailsService.getByQuoteId(v4())
        expect(foundIlpQuote).toBe(undefined)
      })
    })
  })
})
