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
import { Invoice } from '../invoice/model'
import { DateTime } from 'luxon'

describe('WM Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let wmService: WebMonetizationService
  let knex: Knex
  let paymentPointerId: string
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
      const paymentPointerService = await deps.use('paymentPointerService')
      paymentPointerId = (
        await paymentPointerService.create({ asset: randomAsset() })
      ).id
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
        return service.getPaymentPointerInvoicesPage(paymentPointerId)
      }
    )
    expect(invoices.length).toEqual(0)

    const wmInvoice = await wmService.getCurrentInvoice(paymentPointerId)

    invoices = await deps.use('invoiceService').then(
      (service): Promise<Array<Invoice>> => {
        return service.getPaymentPointerInvoicesPage(paymentPointerId)
      }
    )
    expect(invoices.length).toEqual(1)
    expect(wmInvoice.paymentPointerId).toEqual(paymentPointerId)
  })

  test('Returns the current one if still valid', async (): Promise<void> => {
    const currentWmInvoice = await wmService.getCurrentInvoice(paymentPointerId)

    const wmInvoice = await wmService.getCurrentInvoice(paymentPointerId)

    expect(wmInvoice).toEqual(currentWmInvoice)
  })

  test('Throws error for nonexistent payment pointer', async (): Promise<void> => {
    const paymentPointerId = uuid()
    await expect(wmService.getCurrentInvoice(paymentPointerId)).rejects.toThrow(
      'payment pointer not found'
    )
  })

  test('Creates a new one if the old one has expired', async (): Promise<void> => {
    jest.useFakeTimers('modern')
    const currentWmInvoice = await wmService.getCurrentInvoice(paymentPointerId)
    const msTomorrow = DateTime.now().plus({ day: 1 }).toMillis()
    jest.setSystemTime(msTomorrow)

    const wmInvoice = await wmService.getCurrentInvoice(paymentPointerId)

    expect(wmInvoice).not.toEqual(currentWmInvoice)
    const invoices = await deps.use('invoiceService').then(
      (service): Promise<Array<Invoice>> => {
        return service.getPaymentPointerInvoicesPage(paymentPointerId)
      }
    )
    expect(invoices.length).toEqual(2)
  })
})
