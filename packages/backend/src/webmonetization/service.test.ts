import Knex from 'knex'
import { v4 as uuid } from 'uuid'

import { WebMonetizationService } from './service'
import { createTestApp, TestContainer } from '../tests/app'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'
import { randomAsset } from '../tests/asset'
import { truncateTables } from '../tests/tableManager'
import { Invoice } from '../open_payments/invoice/model'

describe('WM Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let wmService: WebMonetizationService
  let knex: Knex
  let accountId: string
  const mockMessageProducer = {
    send: jest.fn()
  }

  beforeAll(
    async (): Promise<void> => {
      deps = await initIocContainer(Config)
      deps.bind('messageProducer', async () => mockMessageProducer)
      appContainer = await createTestApp(deps)
      knex = await deps.use('knex')
    }
  )

  beforeEach(
    async (): Promise<void> => {
      wmService = await deps.use('wmService')
      const accountService = await deps.use('accountService')
      accountId = (await accountService.create({ asset: randomAsset() })).id
    }
  )

  afterEach(
    async (): Promise<void> => {
      await truncateTables(knex)
      jest.useRealTimers()
    }
  )

  afterAll(
    async (): Promise<void> => {
      await truncateTables(knex)
      await appContainer.shutdown()
    }
  )

  test('Creates a new WM invoice if none exists', async (): Promise<void> => {
    let invoices = await deps.use('invoiceService').then(
      (service): Promise<Array<Invoice>> => {
        return service.getAccountInvoicesPage(accountId)
      }
    )
    expect(invoices.length).toEqual(0)

    const wmInvoice = await wmService.getInvoice(accountId)

    invoices = await deps.use('invoiceService').then(
      (service): Promise<Array<Invoice>> => {
        return service.getAccountInvoicesPage(accountId)
      }
    )
    expect(invoices.length).toEqual(1)
    expect(wmInvoice.accountId).toEqual(accountId)
  })

  test('Returns the created WM invoice', async (): Promise<void> => {
    const wmInvoice = await wmService.getInvoice(accountId)
    await expect(wmService.getInvoice(accountId)).resolves.toEqual(wmInvoice)
  })

  test('Throws error for nonexistent account', async (): Promise<void> => {
    const accountId = uuid()
    await expect(wmService.getInvoice(accountId)).rejects.toThrow(
      'account not found'
    )
  })
})
