import Knex from 'knex'
import { WorkerUtils, makeWorkerUtils } from 'graphile-worker'
import { v4 as uuid } from 'uuid'

import { isAccountTransferError } from '../account/errors'
import { InvoiceService } from './service'
import { createTestApp, TestContainer } from '../tests/app'
import { Invoice } from './model'
import { resetGraphileDb } from '../tests/graphileDb'
import { GraphileProducer } from '../messaging/graphileProducer'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'
import { randomAsset } from '../tests/asset'
import { truncateTables } from '../tests/tableManager'
import { AssetOptions } from '../asset/service'
import { AccountFactory } from '../tests/accountFactory'

describe('Invoice Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let workerUtils: WorkerUtils
  let invoiceService: InvoiceService
  let knex: Knex
  let paymentPointerId: string
  let asset: AssetOptions
  let accountFactory: AccountFactory
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
      accountFactory = new AccountFactory(
        await deps.use('accountService'),
        await deps.use('assetService'),
        await deps.use('transferService')
      )
      await workerUtils.migrate()
      messageProducer.setUtils(workerUtils)
      knex = await deps.use('knex')
    }
  )

  beforeEach(
    async (): Promise<void> => {
      invoiceService = await deps.use('invoiceService')
      const paymentPointerService = await deps.use('paymentPointerService')
      asset = randomAsset()
      paymentPointerId = (await paymentPointerService.create({ asset })).id
    }
  )

  afterEach(
    async (): Promise<void> => {
      await truncateTables(knex)
    }
  )

  afterAll(
    async (): Promise<void> => {
      await resetGraphileDb(knex)
      await appContainer.shutdown()
      await workerUtils.release()
    }
  )

  describe('Create/Get Invoice', (): void => {
    test('An invoice can be created and fetched', async (): Promise<void> => {
      const invoice = await invoiceService.create({
        paymentPointerId,
        description: 'Test invoice'
      })
      expect(invoice).toMatchObject({
        id: invoice.id,
        account: {
          asset
        }
      })
      const retrievedInvoice = await invoiceService.get(invoice.id)
      if (!retrievedInvoice) throw new Error('invoice not found')
      expect(retrievedInvoice).toEqual(invoice)
    })

    test('Creating an invoice creates an invoice account', async (): Promise<void> => {
      const accountService = await deps.use('accountService')
      const invoice = await invoiceService.create({
        paymentPointerId,
        description: 'Invoice'
      })
      const invoiceAccount = await accountService.get(invoice.accountId)

      expect(invoiceAccount?.id).toEqual(invoice.accountId)
      expect(invoiceAccount?.receiveLimitBalanceId).toBeNull()
    })

    test('Creating an invoice with amountToReceive sets up a "receive limit" balance', async (): Promise<void> => {
      const invoice = await invoiceService.create({
        paymentPointerId,
        description: 'Invoice',
        amountToReceive: BigInt(123)
      })
      const balanceService = await deps.use('balanceService')
      if (!invoice.account.receiveLimitBalanceId) throw new Error('fail')
      await expect(
        balanceService.get(invoice.account.receiveLimitBalanceId)
      ).resolves.toMatchObject({
        debitBalance: true,
        balance: BigInt(123 + 1)
      })
    })

    test('Cannot create invoice for nonexistent payment pointer', async (): Promise<void> => {
      await expect(
        invoiceService.create({
          paymentPointerId: uuid(),
          description: 'Test invoice'
        })
      ).rejects.toThrow(
        'unable to create invoice, payment pointer does not exist'
      )
    })

    test('Cannot fetch a bogus invoice', async (): Promise<void> => {
      expect(invoiceService.get(uuid())).resolves.toBeUndefined()
    })
  })

  describe('deactivateNext', (): void => {
    test('Does not deactivate a not-expired invoice', async (): Promise<void> => {
      const invoiceId = (
        await invoiceService.create({
          paymentPointerId,
          description: 'Test invoice',
          expiresAt: new Date(Date.now() + 30_000)
        })
      ).id
      await expect(invoiceService.deactivateNext()).resolves.toBeUndefined()
      const invoice = await invoiceService.get(invoiceId)
      if (!invoice) throw new Error('invoice was deleted')
      expect(invoice.active).toBe(true)
    })

    test('Deactivates an expired invoice with received money', async (): Promise<void> => {
      const invoice = await invoiceService.create({
        paymentPointerId,
        description: 'Test invoice',
        expiresAt: new Date(Date.now() - 40_000)
      })
      const accountService = await deps.use('accountService')
      const sourceAccount = await accountFactory.build({
        balance: BigInt(10),
        asset
      })
      const trxOrError = await accountService.transferFunds({
        sourceAccount,
        destinationAccount: invoice.account,
        sourceAmount: BigInt(1),
        timeout: BigInt(10e9) // 10 seconds
      })
      if (isAccountTransferError(trxOrError)) throw trxOrError
      await expect(trxOrError.commit()).resolves.toBeUndefined()

      await expect(invoiceService.deactivateNext()).resolves.toBe(invoice.id)
      const invoiceAfter = await invoiceService.get(invoice.id)
      if (!invoiceAfter) throw new Error('invoice was deleted')
      expect(invoiceAfter.active).toBe(false)
    })

    test('Deletes an expired invoice (and account) with no money', async (): Promise<void> => {
      const accountService = await deps.use('accountService')
      const invoice = await invoiceService.create({
        paymentPointerId,
        description: 'Test invoice',
        expiresAt: new Date(Date.now() - 40_000)
      })
      await expect(invoiceService.deactivateNext()).resolves.toBe(invoice.id)
      expect(await invoiceService.get(invoice.id)).toBeUndefined()
      expect(await accountService.get(invoice.accountId)).toBeUndefined()
    })
  })

  describe('Invoice pagination', (): void => {
    let invoicesCreated: Invoice[]

    beforeEach(
      async (): Promise<void> => {
        invoicesCreated = []
        for (let i = 0; i < 40; i++) {
          invoicesCreated.push(
            await invoiceService.create({
              paymentPointerId,
              description: `Invoice ${i}`
            })
          )
        }
      }
    )

    test('Defaults to fetching first 20 items', async (): Promise<void> => {
      const invoices = await invoiceService.getPaymentPointerInvoicesPage(
        paymentPointerId
      )
      expect(invoices).toHaveLength(20)
      expect(invoices[0].id).toEqual(invoicesCreated[0].id)
      expect(invoices[19].id).toEqual(invoicesCreated[19].id)
      expect(invoices[20]).toBeUndefined()
    })

    test('Can change forward pagination limit', async (): Promise<void> => {
      const pagination = {
        first: 10
      }
      const invoices = await invoiceService.getPaymentPointerInvoicesPage(
        paymentPointerId,
        pagination
      )
      expect(invoices).toHaveLength(10)
      expect(invoices[0].id).toEqual(invoicesCreated[0].id)
      expect(invoices[9].id).toEqual(invoicesCreated[9].id)
      expect(invoices[10]).toBeUndefined()
    })

    test('Can paginate forwards from a cursor', async (): Promise<void> => {
      const pagination = {
        after: invoicesCreated[19].id
      }
      const invoices = await invoiceService.getPaymentPointerInvoicesPage(
        paymentPointerId,
        pagination
      )
      expect(invoices).toHaveLength(20)
      expect(invoices[0].id).toEqual(invoicesCreated[20].id)
      expect(invoices[19].id).toEqual(invoicesCreated[39].id)
      expect(invoices[20]).toBeUndefined()
    })

    test('Can paginate forwards from a cursor with a limit', async (): Promise<void> => {
      const pagination = {
        first: 10,
        after: invoicesCreated[9].id
      }
      const invoices = await invoiceService.getPaymentPointerInvoicesPage(
        paymentPointerId,
        pagination
      )
      expect(invoices).toHaveLength(10)
      expect(invoices[0].id).toEqual(invoicesCreated[10].id)
      expect(invoices[9].id).toEqual(invoicesCreated[19].id)
      expect(invoices[10]).toBeUndefined()
    })

    test("Can't change backward pagination limit on it's own.", async (): Promise<void> => {
      const pagination = {
        last: 10
      }
      const invoices = invoiceService.getPaymentPointerInvoicesPage(
        paymentPointerId,
        pagination
      )
      await expect(invoices).rejects.toThrow(
        "Can't paginate backwards from the start."
      )
    })

    test('Can paginate backwards from a cursor', async (): Promise<void> => {
      const pagination = {
        before: invoicesCreated[20].id
      }
      const invoices = await invoiceService.getPaymentPointerInvoicesPage(
        paymentPointerId,
        pagination
      )
      expect(invoices).toHaveLength(20)
      expect(invoices[0].id).toEqual(invoicesCreated[0].id)
      expect(invoices[19].id).toEqual(invoicesCreated[19].id)
      expect(invoices[20]).toBeUndefined()
    })

    test('Can paginate backwards from a cursor with a limit', async (): Promise<void> => {
      const pagination = {
        last: 5,
        before: invoicesCreated[10].id
      }
      const invoices = await invoiceService.getPaymentPointerInvoicesPage(
        paymentPointerId,
        pagination
      )
      expect(invoices).toHaveLength(5)
      expect(invoices[0].id).toEqual(invoicesCreated[5].id)
      expect(invoices[4].id).toEqual(invoicesCreated[9].id)
      expect(invoices[5]).toBeUndefined()
    })

    test('Backwards/Forwards pagination results in same order.', async (): Promise<void> => {
      const paginationForwards = {
        first: 10
      }
      const invoicesForwards = await invoiceService.getPaymentPointerInvoicesPage(
        paymentPointerId,
        paginationForwards
      )
      const paginationBackwards = {
        last: 10,
        before: invoicesCreated[10].id
      }
      const invoicesBackwards = await invoiceService.getPaymentPointerInvoicesPage(
        paymentPointerId,
        paginationBackwards
      )
      expect(invoicesForwards).toHaveLength(10)
      expect(invoicesBackwards).toHaveLength(10)
      expect(invoicesForwards).toEqual(invoicesBackwards)
    })

    test('Providing before and after results in forward pagination', async (): Promise<void> => {
      const pagination = {
        after: invoicesCreated[19].id,
        before: invoicesCreated[19].id
      }
      const invoices = await invoiceService.getPaymentPointerInvoicesPage(
        paymentPointerId,
        pagination
      )
      expect(invoices).toHaveLength(20)
      expect(invoices[0].id).toEqual(invoicesCreated[20].id)
      expect(invoices[19].id).toEqual(invoicesCreated[39].id)
      expect(invoices[20]).toBeUndefined()
    })

    test("Can't request less than 0 invoices", async (): Promise<void> => {
      const pagination = {
        first: -1
      }
      const invoices = invoiceService.getPaymentPointerInvoicesPage(
        paymentPointerId,
        pagination
      )
      await expect(invoices).rejects.toThrow('Pagination index error')
    })

    test("Can't request more than 100 invoices", async (): Promise<void> => {
      const pagination = {
        first: 101
      }
      const invoices = invoiceService.getPaymentPointerInvoicesPage(
        paymentPointerId,
        pagination
      )
      await expect(invoices).rejects.toThrow('Pagination index error')
    })
  })
})
