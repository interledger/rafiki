import * as httpMocks from 'node-mocks-http'
import base64url from 'base64url'
import Knex from 'knex'
import { WorkerUtils, makeWorkerUtils } from 'graphile-worker'
import { v4 as uuid } from 'uuid'

import { createContext } from '../tests/context'
import { PaymentPointerService } from '../payment_pointer/service'
import { PaymentPointer } from '../payment_pointer/model'
import { createTestApp, TestContainer } from '../tests/app'
import { resetGraphileDb } from '../tests/graphileDb'
import { GraphileProducer } from '../messaging/graphileProducer'
import { Config, IAppConfig } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'
import { truncateTables } from '../tests/tableManager'
import { randomAsset } from '../tests/asset'
import { InvoiceService } from './service'
import { Invoice } from './model'
import { InvoiceRoutes, MAX_EXPIRY } from './routes'
import { AppContext } from '../app'

describe('Invoice Routes', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let workerUtils: WorkerUtils
  let paymentPointerService: PaymentPointerService
  let invoiceService: InvoiceService
  let config: IAppConfig
  let invoiceRoutes: InvoiceRoutes
  const messageProducer = new GraphileProducer()
  const mockMessageProducer = {
    send: jest.fn()
  }

  beforeAll(
    async (): Promise<void> => {
      config = Config
      config.publicHost = 'https://wallet.example'
      deps = await initIocContainer(config)
      deps.bind('messageProducer', async () => mockMessageProducer)
      appContainer = await createTestApp(deps)
      workerUtils = await makeWorkerUtils({
        connectionString: appContainer.connectionUrl
      })
      await workerUtils.migrate()
      messageProducer.setUtils(workerUtils)
      knex = await deps.use('knex')
    }
  )

  let asset: { code: string; scale: number }
  let paymentPointer: PaymentPointer
  let invoice: Invoice
  let expiresAt: Date

  beforeEach(
    async (): Promise<void> => {
      paymentPointerService = await deps.use('paymentPointerService')
      invoiceService = await deps.use('invoiceService')
      config = await deps.use('config')
      invoiceRoutes = await deps.use('invoiceRoutes')

      asset = randomAsset()
      expiresAt = new Date(Date.now() + 30_000)
      paymentPointer = await paymentPointerService.create({ asset })
      invoice = await invoiceService.create({
        paymentPointerId: paymentPointer.id,
        description: 'text',
        expiresAt,
        amountToReceive: BigInt(123)
      })
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

  describe('get', (): void => {
    test('returns error on invalid id', async (): Promise<void> => {
      const ctx = createContext(
        {
          headers: { Accept: 'application/json' }
        },
        { invoiceId: 'not_a_uuid' }
      )
      await expect(invoiceRoutes.get(ctx)).rejects.toHaveProperty(
        'message',
        'invalid id'
      )
    })

    test('returns 406 for wrong Accept', async (): Promise<void> => {
      const ctx = createContext(
        {
          headers: { Accept: 'test/plain' }
        },
        { invoiceId: uuid() }
      )
      await expect(invoiceRoutes.get(ctx)).rejects.toHaveProperty('status', 406)
    })

    test('returns 404 for nonexistent invoice', async (): Promise<void> => {
      const ctx = createContext(
        {
          headers: { Accept: 'application/json' }
        },
        { invoiceId: uuid() }
      )
      await expect(invoiceRoutes.get(ctx)).rejects.toHaveProperty('status', 404)
    })

    test('returns 200 with an open payments invoice', async (): Promise<void> => {
      const ctx = createContext(
        {
          headers: { Accept: 'application/json' }
        },
        { invoiceId: invoice.id }
      )
      await expect(invoiceRoutes.get(ctx)).resolves.toBeUndefined()
      expect(ctx.status).toBe(200)
      expect(ctx.response.get('Content-Type')).toBe(
        'application/json; charset=utf-8'
      )

      expect(ctx.body).toEqual({
        id: `https://wallet.example/invoices/${invoice.id}`,
        account: `https://wallet.example/pay/${paymentPointer.id}`,
        amount: '123',
        assetCode: asset.code,
        assetScale: asset.scale,
        description: invoice.description,
        expiresAt: expiresAt.toISOString(),
        received: '0'
      })
    })

    test('returns the invoice with ilpAddress/sharedSecret when stream is requested', async (): Promise<void> => {
      const ctx = createContext(
        { headers: { Accept: 'application/ilp-stream+json' } },
        { invoiceId: invoice.id }
      )
      await expect(invoiceRoutes.get(ctx)).resolves.toBeUndefined()
      expect(ctx.response.status).toBe(200)

      const sharedSecret = (ctx.response.body as Record<string, unknown>)[
        'sharedSecret'
      ]
      expect(ctx.body).toEqual({
        id: `https://wallet.example/invoices/${invoice.id}`,
        account: `https://wallet.example/pay/${paymentPointer.id}`,
        amount: '123',
        assetCode: asset.code,
        assetScale: asset.scale,
        description: invoice.description,
        received: '0',
        expiresAt: expiresAt.toISOString(),
        ilpAddress: expect.stringMatching(/^test\.rafiki\.[a-zA-Z0-9_-]{95}$/),
        sharedSecret
      })
      const sharedSecretBuffer = Buffer.from(sharedSecret as string, 'base64')
      expect(sharedSecretBuffer).toHaveLength(32)
      expect(sharedSecret).toEqual(base64url(sharedSecretBuffer))
    })
  })

  describe('create', (): void => {
    function setup(
      reqOpts: Pick<httpMocks.RequestOptions, 'headers'>
    ): AppContext {
      const ctx = createContext(
        {
          headers: Object.assign(
            { Accept: 'application/json', 'Content-Type': 'application/json' },
            reqOpts.headers
          )
        },
        { paymentPointerId: paymentPointer.id }
      )
      ctx.request.body = {
        amount: invoice.amountToReceive,
        description: invoice.description,
        expiresAt: invoice.expiresAt?.toISOString()
      }
      return ctx
    }

    test('returns error on invalid id', async (): Promise<void> => {
      const ctx = setup({})
      ctx.params.paymentPointerId = 'not_a_uuid'
      await expect(invoiceRoutes.create(ctx)).rejects.toHaveProperty(
        'message',
        'invalid payment pointer'
      )
    })

    test('returns 406 on invalid Accept', async (): Promise<void> => {
      const ctx = setup({ headers: { Accept: 'text/plain' } })
      await expect(invoiceRoutes.create(ctx)).rejects.toHaveProperty(
        'status',
        406
      )
    })

    test('returns error on invalid Content-Type', async (): Promise<void> => {
      const ctx = setup({ headers: { 'Content-Type': 'text/plain' } })
      await expect(invoiceRoutes.create(ctx)).rejects.toHaveProperty(
        'message',
        'must send json body'
      )
    })

    test('returns error on missing amount', async (): Promise<void> => {
      const ctx = setup({})
      ctx.request.body['amount'] = undefined
      await expect(invoiceRoutes.create(ctx)).rejects.toHaveProperty(
        'message',
        'invalid amount'
      )
    })

    test('returns error on invalid amount', async (): Promise<void> => {
      const ctx = setup({})
      ctx.request.body['amount'] = 'fail'
      await expect(invoiceRoutes.create(ctx)).rejects.toHaveProperty(
        'message',
        'invalid amount'
      )
    })

    test('returns error on invalid description', async (): Promise<void> => {
      const ctx = setup({})
      ctx.request.body['description'] = 123
      await expect(invoiceRoutes.create(ctx)).rejects.toHaveProperty(
        'message',
        'invalid description'
      )
    })

    test('returns error on invalid expiresAt', async (): Promise<void> => {
      const ctx = setup({})
      ctx.request.body['expiresAt'] = 'fail'
      await expect(invoiceRoutes.create(ctx)).rejects.toHaveProperty(
        'message',
        'invalid expiresAt'
      )
    })

    test('returns error on distant-future expiresAt', async (): Promise<void> => {
      const ctx = setup({})
      ctx.request.body['expiresAt'] = new Date(
        Date.now() + MAX_EXPIRY + 1000
      ).toISOString()
      await expect(invoiceRoutes.create(ctx)).rejects.toHaveProperty(
        'message',
        'expiry too high'
      )
    })

    test('returns error on already-expired expiresAt', async (): Promise<void> => {
      const ctx = setup({})
      ctx.request.body['expiresAt'] = new Date(Date.now() - 1).toISOString()
      await expect(invoiceRoutes.create(ctx)).rejects.toHaveProperty(
        'message',
        'already expired'
      )
    })

    test('returns the invoice on success', async (): Promise<void> => {
      const ctx = setup({})
      await expect(invoiceRoutes.create(ctx)).resolves.toBeUndefined()
      expect(ctx.response.status).toBe(201)
      const invoiceId = ((ctx.response.body as Record<string, unknown>)[
        'id'
      ] as string)
        .split('/')
        .pop()
      expect(ctx.response.headers['location']).toBe(
        `${config.publicHost}/invoices/${invoiceId}`
      )
      expect(ctx.response.body).toEqual({
        id: `${config.publicHost}/invoices/${invoiceId}`,
        account: `${config.publicHost}/pay/${invoice.paymentPointerId}`,
        amount: invoice.amountToReceive?.toString(),
        assetCode: invoice.account.asset.code,
        assetScale: invoice.account.asset.scale,
        description: invoice.description,
        expiresAt: expiresAt.toISOString(),
        received: '0'
      })
    })

    test('returns the invoice on undefined description', async (): Promise<void> => {
      const ctx = setup({})
      ctx.request.body['description'] = undefined
      await expect(invoiceRoutes.create(ctx)).resolves.toBeUndefined()
      expect(ctx.response.status).toBe(201)
      const invoiceId = ((ctx.response.body as Record<string, unknown>)[
        'id'
      ] as string)
        .split('/')
        .pop()
      expect(ctx.response.headers['location']).toBe(
        `${config.publicHost}/invoices/${invoiceId}`
      )
      expect(ctx.response.body).toEqual({
        id: `${config.publicHost}/invoices/${invoiceId}`,
        account: `${config.publicHost}/pay/${invoice.paymentPointerId}`,
        amount: invoice.amountToReceive?.toString(),
        assetCode: invoice.account.asset.code,
        assetScale: invoice.account.asset.scale,
        description: null,
        expiresAt: expiresAt.toISOString(),
        received: '0'
      })
    })
  })
})
