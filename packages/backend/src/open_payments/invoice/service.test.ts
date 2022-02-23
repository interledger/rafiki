import assert from 'assert'
import Knex from 'knex'
import { WorkerUtils, makeWorkerUtils } from 'graphile-worker'
import { v4 as uuid } from 'uuid'

import { InvoiceService } from './service'
import { AccountingService } from '../../accounting/service'
import { createTestApp, TestContainer } from '../../tests/app'
import { Invoice, InvoiceEvent, InvoiceEventType } from './model'
import { resetGraphileDb } from '../../tests/graphileDb'
import { GraphileProducer } from '../../messaging/graphileProducer'
import { Config } from '../../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../'
import { AppServices } from '../../app'
import { Pagination } from '../../shared/baseModel'
import { getPageTests } from '../../shared/baseModel.test'
import { randomAsset } from '../../tests/asset'
import { truncateTables } from '../../tests/tableManager'

describe('Invoice Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let workerUtils: WorkerUtils
  let invoiceService: InvoiceService
  let knex: Knex
  let accountId: string
  let accountingService: AccountingService
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
      accountingService = await deps.use('accountingService')
      await workerUtils.migrate()
      messageProducer.setUtils(workerUtils)
      knex = await deps.use('knex')
    }
  )

  beforeEach(
    async (): Promise<void> => {
      invoiceService = await deps.use('invoiceService')
      const accountService = await deps.use('accountService')
      accountId = (await accountService.create({ asset: randomAsset() })).id
    }
  )

  afterEach(
    async (): Promise<void> => {
      jest.useRealTimers()
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
        accountId,
        amount: BigInt(123),
        expiresAt: new Date(Date.now() + 30_000),
        description: 'Test invoice'
      })
      const accountService = await deps.use('accountService')
      expect(invoice).toMatchObject({
        id: invoice.id,
        account: await accountService.get(accountId),
        processAt: new Date(invoice.expiresAt.getTime())
      })
      const retrievedInvoice = await invoiceService.get(invoice.id)
      if (!retrievedInvoice) throw new Error('invoice not found')
      expect(retrievedInvoice).toEqual(invoice)
    })

    test('Creating an invoice creates a liquidity account', async (): Promise<void> => {
      const invoice = await invoiceService.create({
        accountId,
        description: 'Invoice',
        expiresAt: new Date(Date.now() + 30_000),
        amount: BigInt(123)
      })
      await expect(accountingService.getBalance(invoice.id)).resolves.toEqual(
        BigInt(0)
      )
    })

    test('Cannot create invoice for nonexistent account', async (): Promise<void> => {
      await expect(
        invoiceService.create({
          accountId: uuid(),
          amount: BigInt(123),
          expiresAt: new Date(Date.now() + 30_000),
          description: 'Test invoice'
        })
      ).rejects.toThrow('unable to create invoice, account does not exist')
    })

    test('Cannot fetch a bogus invoice', async (): Promise<void> => {
      await expect(invoiceService.get(uuid())).resolves.toBeUndefined()
    })
  })

  describe('onCredit', (): void => {
    let invoice: Invoice

    beforeEach(
      async (): Promise<void> => {
        invoice = await invoiceService.create({
          accountId,
          description: 'Test invoice',
          amount: BigInt(123),
          expiresAt: new Date(Date.now() + 30_000)
        })
      }
    )

    test('Does not deactivate a partially paid invoice', async (): Promise<void> => {
      await expect(
        invoice.onCredit({
          totalReceived: invoice.amount - BigInt(1)
        })
      ).resolves.toEqual(invoice)
      await expect(invoiceService.get(invoice.id)).resolves.toMatchObject({
        active: true,
        processAt: new Date(invoice.expiresAt.getTime())
      })
    })

    test('Deactivates fully paid invoice', async (): Promise<void> => {
      const now = new Date()
      jest.useFakeTimers('modern')
      jest.setSystemTime(now)
      await expect(
        invoice.onCredit({
          totalReceived: invoice.amount
        })
      ).resolves.toMatchObject({
        id: invoice.id,
        active: false,
        processAt: new Date(now.getTime() + 30_000)
      })
      await expect(invoiceService.get(invoice.id)).resolves.toMatchObject({
        active: false,
        processAt: new Date(now.getTime() + 30_000)
      })
    })
  })

  describe('processNext', (): void => {
    test('Does not process not-expired active invoice', async (): Promise<void> => {
      const { id: invoiceId } = await invoiceService.create({
        accountId,
        amount: BigInt(123),
        description: 'Test invoice',
        expiresAt: new Date(Date.now() + 30_000)
      })
      await expect(invoiceService.processNext()).resolves.toBeUndefined()
      await expect(invoiceService.get(invoiceId)).resolves.toMatchObject({
        active: true
      })
    })

    describe('handleExpired', (): void => {
      test('Deactivates an expired invoice with received money', async (): Promise<void> => {
        const invoice = await invoiceService.create({
          accountId,
          amount: BigInt(123),
          description: 'Test invoice',
          expiresAt: new Date(Date.now() - 40_000)
        })
        await expect(
          accountingService.createDeposit({
            id: uuid(),
            account: invoice,
            amount: BigInt(1)
          })
        ).resolves.toBeUndefined()

        const now = new Date()
        jest.useFakeTimers('modern')
        jest.setSystemTime(now)
        await expect(invoiceService.processNext()).resolves.toBe(invoice.id)
        await expect(invoiceService.get(invoice.id)).resolves.toMatchObject({
          active: false,
          processAt: new Date(now.getTime() + 30_000)
        })
      })

      test('Deletes an expired invoice (and account) with no money', async (): Promise<void> => {
        const invoice = await invoiceService.create({
          accountId,
          amount: BigInt(123),
          description: 'Test invoice',
          expiresAt: new Date(Date.now() - 40_000)
        })
        await expect(invoiceService.processNext()).resolves.toBe(invoice.id)
        expect(await invoiceService.get(invoice.id)).toBeUndefined()
      })
    })

    describe.each`
      eventType                          | expiresAt  | amountReceived
      ${InvoiceEventType.InvoiceExpired} | ${-40_000} | ${BigInt(1)}
      ${InvoiceEventType.InvoicePaid}    | ${30_000}  | ${BigInt(123)}
    `(
      'handleDeactivated ($eventType)',
      ({ eventType, expiresAt, amountReceived }): void => {
        let invoice: Invoice

        beforeEach(
          async (): Promise<void> => {
            invoice = await invoiceService.create({
              accountId,
              amount: BigInt(123),
              expiresAt: new Date(Date.now() + expiresAt),
              description: 'Test invoice'
            })
            await expect(
              accountingService.createDeposit({
                id: uuid(),
                account: invoice,
                amount: amountReceived
              })
            ).resolves.toBeUndefined()
            if (eventType === InvoiceEventType.InvoiceExpired) {
              await expect(invoiceService.processNext()).resolves.toBe(
                invoice.id
              )
            } else {
              await invoice.onCredit({
                totalReceived: invoice.amount
              })
            }
            invoice = (await invoiceService.get(invoice.id)) as Invoice
            expect(invoice.active).toBe(false)
            expect(invoice.processAt).not.toBeNull()
            await expect(
              accountingService.getTotalReceived(invoice.id)
            ).resolves.toEqual(amountReceived)
            await expect(
              accountingService.getBalance(invoice.id)
            ).resolves.toEqual(amountReceived)
          }
        )

        test('Creates webhook event', async (): Promise<void> => {
          await expect(
            InvoiceEvent.query(knex).where({
              type: eventType
            })
          ).resolves.toHaveLength(0)
          assert.ok(invoice.processAt)
          jest.useFakeTimers('modern')
          jest.setSystemTime(invoice.processAt)
          await expect(invoiceService.processNext()).resolves.toBe(invoice.id)
          await expect(
            InvoiceEvent.query(knex).where({
              type: eventType,
              withdrawalAccountId: invoice.id,
              withdrawalAmount: amountReceived
            })
          ).resolves.toHaveLength(1)
          await expect(invoiceService.get(invoice.id)).resolves.toMatchObject({
            processAt: null
          })
        })
      }
    )
  })

  describe('Invoice pagination', (): void => {
    getPageTests({
      createModel: () =>
        invoiceService.create({
          accountId,
          amount: BigInt(123),
          expiresAt: new Date(Date.now() + 30_000),
          description: 'Invoice'
        }),
      getPage: (pagination: Pagination) =>
        invoiceService.getAccountInvoicesPage(accountId, pagination)
    })
  })
})
