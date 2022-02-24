import Knex from 'knex'

import { getPageTests } from './page.test'
import { createTestApp, TestContainer } from '../../tests/app'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { randomAsset } from '../../tests/asset'
import { truncateTables } from '../../tests/tableManager'
import { InvoiceService } from '../../open_payments/invoice/service'
import { AccountService } from '../../open_payments/account/service'

describe('Invoice Resolver', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let invoiceService: InvoiceService
  let accountService: AccountService
  let knex: Knex
  let accountId: string

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    knex = await deps.use('knex')
    invoiceService = await deps.use('invoiceService')
    accountService = await deps.use('accountService')
  }, 10_000)

  afterAll(
    async (): Promise<void> => {
      await truncateTables(knex)
      await appContainer.apolloClient.stop()
      await appContainer.shutdown()
    }
  )

  describe('Account invoices', (): void => {
    beforeEach(
      async (): Promise<void> => {
        accountId = (await accountService.create({ asset: randomAsset() })).id
      }
    )

    getPageTests({
      getClient: () => appContainer.apolloClient,
      createModel: () =>
        invoiceService.create({
          accountId,
          amount: BigInt(123),
          expiresAt: new Date(Date.now() + 30_000),
          description: `Invoice`
        }),
      pagedQuery: 'invoices',
      parent: {
        query: 'account',
        getId: () => accountId
      }
    })
  })
})
