import { Transaction as KnexTransaction } from 'knex'
import { WorkerUtils, makeWorkerUtils } from 'graphile-worker'

import { InvoiceService } from './service'
import { createTestApp, TestContainer } from '../tests/app'
import { Invoice } from './model'
import { resetGraphileDb } from '../tests/graphileDb'
import { GraphileProducer } from '../messaging/graphileProducer'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'

describe('Invoice Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let trx: KnexTransaction
  let workerUtils: WorkerUtils
  let invoiceService: InvoiceService
  const messageProducer = new GraphileProducer()
  const mockMessageProducer = {
    send: jest.fn()
  }

  beforeAll(
    async (): Promise<void> => {
      deps = await initIocContainer(Config)
      deps.bind('messageProducer', async () => mockMessageProducer)
      appContainer = await createTestApp(deps)
      workerUtils = await makeWorkerUtils({
        connectionString: appContainer.connectionUrl
      })
      await workerUtils.migrate()
      messageProducer.setUtils(workerUtils)
    }
  )

  beforeEach(
    async (): Promise<void> => {
      trx = await appContainer.knex.transaction()
      invoiceService = await deps.use('invoiceService')
    }
  )

  afterEach(
    async (): Promise<void> => {
      await trx.rollback()
      await trx.destroy()
    }
  )

  afterAll(
    async (): Promise<void> => {
      await appContainer.shutdown()
      await workerUtils.release()
      await resetGraphileDb(appContainer.knex)
    }
  )

  describe('Invoice', (): void => {
    let invoice: Invoice

    beforeEach(
      async (): Promise<void> => {
        invoice = await invoiceService.create()
        console.log('INVOICE', invoice)
      }
    )

    test('An invoice can be fetched', async (): Promise<void> => {
      const retrievedInvoice = await invoiceService.get(invoice.id)
      expect(retrievedInvoice.id).toEqual(invoice.id)
      expect(retrievedInvoice.accountId).toEqual(invoice.accountId)
      expect(retrievedInvoice.userId).toEqual(invoice.userId)
    })
  })
})
