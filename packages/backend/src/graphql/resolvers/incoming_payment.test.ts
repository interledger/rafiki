import { Knex } from 'knex'

import { getPageTests } from './page.test'
import { createTestApp, TestContainer } from '../../tests/app'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { randomAsset } from '../../tests/asset'
import { createIncomingPayment } from '../../tests/incomingPayment'
import { createPaymentPointer } from '../../tests/paymentPointer'
import { truncateTables } from '../../tests/tableManager'
import { v4 as uuid } from 'uuid'
import { GrantReference } from '../../open_payments/grantReference/model'
import { GrantReferenceService } from '../../open_payments/grantReference/service'

describe('Incoming Payment Resolver', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let paymentPointerId: string
  let grantReferenceService: GrantReferenceService
  let grantRef: GrantReference

  const asset = randomAsset()

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    knex = await deps.use('knex')
    grantReferenceService = await deps.use('grantReferenceService')
  })

  afterAll(async (): Promise<void> => {
    await truncateTables(knex)
    await appContainer.apolloClient.stop()
    await appContainer.shutdown()
  })

  describe('Payment pointer incoming payments', (): void => {
    beforeEach(async (): Promise<void> => {
      paymentPointerId = (await createPaymentPointer(deps, { asset })).id
      grantRef = await grantReferenceService.create({
        id: uuid(),
        clientId: uuid()
      })
    })

    getPageTests({
      getClient: () => appContainer.apolloClient,
      createModel: () =>
        createIncomingPayment(deps, {
          paymentPointerId,
          grantId: grantRef.id,
          incomingAmount: {
            value: BigInt(123),
            assetCode: asset.code,
            assetScale: asset.scale
          },
          expiresAt: new Date(Date.now() + 30_000),
          description: `IncomingPayment`,
          externalRef: '#123'
        }),
      pagedQuery: 'incomingPayments',
      parent: {
        query: 'paymentPointer',
        getId: () => paymentPointerId
      }
    })
  })
})
