import Knex from 'knex'

import { getPageTests } from './page.test'
import { createTestApp, TestContainer } from '../../tests/app'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { randomAsset } from '../../tests/asset'
import { truncateTables } from '../../tests/tableManager'
import { IncomingPaymentService } from '../../open_payments/payment/incoming/service'
import { AccountService } from '../../open_payments/account/service'

describe('Incoming Payment Resolver', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let incomingPaymentService: IncomingPaymentService
  let accountService: AccountService
  let knex: Knex
  let accountId: string

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    knex = await deps.use('knex')
    incomingPaymentService = await deps.use('incomingPaymentService')
    accountService = await deps.use('accountService')
  }, 10_000)

  afterAll(
    async (): Promise<void> => {
      await truncateTables(knex)
      await appContainer.apolloClient.stop()
      await appContainer.shutdown()
    }
  )

  describe('Account incoming payments', (): void => {
    beforeEach(
      async (): Promise<void> => {
        accountId = (await accountService.create({ asset: randomAsset() })).id
      }
    )

    getPageTests({
      getClient: () => appContainer.apolloClient,
      createModel: () =>
        incomingPaymentService.create({
          accountId,
          incomingAmount: BigInt(123),
          expiresAt: new Date(Date.now() + 30_000),
          description: `IncomingPayment`
        }),
      pagedQuery: 'incomingPayments',
      parent: {
        query: 'account',
        getId: () => accountId
      }
    })
  })
})
