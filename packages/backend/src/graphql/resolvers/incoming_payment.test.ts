import assert from 'assert'
import Knex from 'knex'

import { getPageTests } from './page.test'
import { createTestApp, TestContainer } from '../../tests/app'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { randomAsset } from '../../tests/asset'
import { truncateTables } from '../../tests/tableManager'
import {
  CreateIncomingPaymentOptions,
  IncomingPaymentService
} from '../../open_payments/payment/incoming/service'
import { AccountService } from '../../open_payments/account/service'
import { isIncomingPaymentError } from '../../open_payments/payment/incoming/errors'
import { IncomingPayment } from '../../open_payments/payment/incoming/model'

describe('Incoming Payment Resolver', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let incomingPaymentService: IncomingPaymentService
  let accountService: AccountService
  let knex: Knex
  let accountId: string

  const asset = randomAsset()

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
    const createPayment = async (
      options: CreateIncomingPaymentOptions
    ): Promise<IncomingPayment> => {
      const payment = await incomingPaymentService.create(options)
      assert.ok(!isIncomingPaymentError(payment))
      return payment
    }

    beforeEach(
      async (): Promise<void> => {
        accountId = (await accountService.create({ asset })).id
      }
    )

    getPageTests({
      getClient: () => appContainer.apolloClient,
      createModel: () =>
        createPayment({
          accountId,
          incomingAmount: {
            amount: BigInt(123),
            assetCode: asset.code,
            assetScale: asset.scale
          },
          expiresAt: new Date(Date.now() + 30_000),
          description: `IncomingPayment`,
          externalRef: '#123'
        }),
      pagedQuery: 'incomingPayments',
      parent: {
        query: 'account',
        getId: () => accountId
      }
    })
  })
})
