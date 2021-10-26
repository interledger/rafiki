import EventEmitter from 'events'
import * as crypto from 'crypto'
import Knex from 'knex'
import Koa from 'koa'
import * as httpMocks from 'node-mocks-http'
import { AppContext, AppContextData, AppServices } from '../app'

import { SPSPService } from './service'
import { createTestApp, TestContainer } from '../tests/app'
import { initIocContainer } from '../'
import { Config } from '../config/app'
import { GraphileProducer } from '../messaging/graphileProducer'
import { resetGraphileDb } from '../tests/graphileDb'

import { IocContract } from '@adonisjs/fold'
import { makeWorkerUtils, WorkerUtils } from 'graphile-worker'
import { v4 } from 'uuid'
import { StreamServer } from '@interledger/stream-receiver'
import { truncateTables } from '../tests/tableManager'
import { PaymentPointerService } from '../payment_pointer/service'
import { WebMonetizationService } from '../webmonetization/service'

describe('SPSP Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let workerUtils: WorkerUtils
  let paymentPointerService: PaymentPointerService
  let wmService: WebMonetizationService
  let SPSPService: SPSPService
  let streamServer: StreamServer
  const nonce = crypto.randomBytes(16).toString('base64')
  const secret = crypto.randomBytes(32).toString('base64')
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
      knex = await deps.use('knex')
    }
  )

  beforeEach(
    async (): Promise<void> => {
      SPSPService = await deps.use('SPSPService')
      streamServer = await deps.use('streamServer')
      paymentPointerService = await deps.use('paymentPointerService')
      wmService = await deps.use('wmService')
    }
  )

  afterAll(
    async (): Promise<void> => {
      await resetGraphileDb(knex)
      await truncateTables(knex)
      await appContainer.shutdown()
      await workerUtils.release()
    }
  )

  describe('GET /pay/:id handler', (): void => {
    let paymentPointerId: string

    beforeEach(
      async (): Promise<void> => {
        paymentPointerId = (
          await paymentPointerService.create({
            asset: {
              scale: 6,
              code: 'USD'
            }
          })
        ).id
      }
    )

    test('invalid payment pointer id; returns 400', async () => {
      const ctx: AppContext = createContext({}, 'not_a_uuid')
      await expect(SPSPService.GETPayEndpoint(ctx)).rejects.toHaveProperty(
        'status',
        400
      )
    })

    test('wrong Accept; returns 406', async () => {
      const ctx = createContext(
        {
          headers: { Accept: 'application/json' }
        },
        paymentPointerId
      )
      await expect(SPSPService.GETPayEndpoint(ctx)).rejects.toHaveProperty(
        'status',
        406
      )
    })

    test('nonce, no secret; returns 400', async () => {
      const ctx = createContext(
        {
          headers: { 'Receipt-Nonce': nonce }
        },
        paymentPointerId
      )
      await expect(SPSPService.GETPayEndpoint(ctx)).rejects.toHaveProperty(
        'status',
        400
      )
    })

    test('secret; no nonce; returns 400', async () => {
      const ctx = createContext(
        {
          headers: { 'Receipt-Secret': secret }
        },
        paymentPointerId
      )
      await expect(SPSPService.GETPayEndpoint(ctx)).rejects.toHaveProperty(
        'status',
        400
      )
    })

    test('malformed nonce; returns 400', async () => {
      const ctx = createContext(
        {
          headers: {
            'Receipt-Nonce': Buffer.alloc(15).toString('base64'),
            'Receipt-Secret': secret
          }
        },
        paymentPointerId
      )
      await expect(SPSPService.GETPayEndpoint(ctx)).rejects.toHaveProperty(
        'status',
        400
      )
    })

    test('no payment pointer; returns 404', async () => {
      const ctx = createContext({}, v4())
      await expect(SPSPService.GETPayEndpoint(ctx)).resolves.toBeUndefined()
      expect(ctx.response.status).toBe(404)
      expect(ctx.response.get('Content-Type')).toBe('application/spsp4+json')
      expect(JSON.parse(ctx.body as string)).toEqual({
        id: 'InvalidReceiverError',
        message: 'Invalid receiver ID'
      })
    })

    /*
    test('disabled account; returns 404', async () => {
      const ctx = createContext({})
      await expect(handle(ctx, next)).resolves.toBeUndefined()
      expect(ctx.response.status).toBe(404)
      expect(ctx.response.get('Content-Type')).toBe('application/spsp4+json')
      expect(JSON.parse(ctx.body as string)).toEqual({
        id: 'InvalidReceiverError',
        message: 'Invalid receiver ID'
      })
    })

    test('disabled stream; returns 400', async () => {
      const ctx = createContext({})
      await expect(handle(ctx, next)).rejects.toHaveProperty('status', 400)
    })
  */

    test('receipts disabled', async () => {
      const ctx = createContext({}, paymentPointerId)
      await expect(SPSPService.GETPayEndpoint(ctx)).resolves.toBeUndefined()
      expect(ctx.response.get('Content-Type')).toBe('application/spsp4+json')

      const res = JSON.parse(ctx.body as string)
      expect(res.destination_account).toEqual(
        expect.stringMatching(/^test\.rafiki\.[a-zA-Z0-9_-]{95}$/)
      )
      expect(Buffer.from(res.shared_secret, 'base64')).toHaveLength(32)
      expect(res.receipts_enabled).toBe(false)
      const connectionDetails = await decryptConnectionDetails(
        res.destination_account
      )
      const currentInvoice = await wmService.getInvoice(paymentPointerId)
      expect(connectionDetails).toEqual({
        paymentTag: currentInvoice.accountId,
        asset: {
          code: 'USD',
          scale: 6
        }
      })
    })

    test('receipts enabled', async () => {
      const ctx = createContext(
        {
          headers: {
            'Receipt-Nonce': nonce,
            'Receipt-Secret': secret
          }
        },
        paymentPointerId
      )
      await expect(SPSPService.GETPayEndpoint(ctx)).resolves.toBeUndefined()
      expect(ctx.response.get('Content-Type')).toBe('application/spsp4+json')

      const res = JSON.parse(ctx.body as string)
      expect(ctx.status).toBe(200)
      expect(res.destination_account).toEqual(
        expect.stringMatching(/^test\.rafiki\.[a-zA-Z0-9_-]{159}$/)
      )
      expect(Buffer.from(res.shared_secret, 'base64')).toHaveLength(32)
      expect(res.receipts_enabled).toBe(true)
      const connectionDetails = await decryptConnectionDetails(
        res.destination_account
      )
      const currentInvoice = await wmService.getInvoice(paymentPointerId)
      expect(connectionDetails).toEqual({
        paymentTag: currentInvoice.accountId,
        asset: {
          code: 'USD',
          scale: 6
        },
        receiptSetup: {
          nonce: Buffer.from(nonce, 'base64'),
          secret: Buffer.from(secret, 'base64')
        }
      })
    })

    /**
     * Utility functions
     */
    function createContext(
      reqOpts: httpMocks.RequestOptions,
      paymentPointerId: string
    ): AppContext {
      reqOpts.headers = Object.assign(
        { accept: 'application/spsp4+json' },
        reqOpts.headers
      )
      const req = httpMocks.createRequest(reqOpts)
      const res = httpMocks.createResponse()
      const koa = new Koa<unknown, AppContextData>()
      const ctx = koa.createContext(req, res)
      ctx.params = { id: paymentPointerId }
      ctx.closeEmitter = new EventEmitter()
      return ctx as AppContext
    }

    async function decryptConnectionDetails(
      destination: string
    ): Promise<unknown> {
      const token = streamServer['extractLocalAddressSegment'](destination)
      return streamServer['decryptToken'](Buffer.from(token, 'base64'))
    }
  })
})
