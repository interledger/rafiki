import EventEmitter from 'events'
import * as crypto from 'crypto'
import { Transaction as KnexTransaction } from 'knex'
import Koa from 'koa'
import * as httpMocks from 'node-mocks-http'
import { AppContext, AppContextData, AppServices } from '../app'
import { UserService } from '../user/service'
import { SPSPService } from './service'
import { createTestApp, TestContainer } from '../tests/app'
import { initIocContainer } from '../'
import { Config } from '../config/app'
import { GraphileProducer } from '../messaging/graphileProducer'
import { resetGraphileDb } from '../tests/graphileDb'
import { User } from '../user/model'
import { IocContract } from '@adonisjs/fold'
import { makeWorkerUtils, WorkerUtils } from 'graphile-worker'
import { v4 } from 'uuid'
import { StreamServer } from '@interledger/stream-receiver'

describe('SPSP Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let trx: KnexTransaction
  let workerUtils: WorkerUtils
  let userService: UserService
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
    }
  )

  beforeEach(
    async (): Promise<void> => {
      trx = await appContainer.knex.transaction()
      userService = await deps.use('userService')
      SPSPService = await deps.use('SPSPService')
      streamServer = await deps.use('streamServer')
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

  describe('GET /pay/:id handler', (): void => {
    let user: User
    let accountId: string

    beforeEach(
      async (): Promise<void> => {
        user = await userService.create()
        accountId = user.accountId
      }
    )

    test('invalid account id; returns 400', async () => {
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
        user.id
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
        user.id
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
        user.id
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
        user.id
      )
      await expect(SPSPService.GETPayEndpoint(ctx)).rejects.toHaveProperty(
        'status',
        400
      )
    })

    test('no account; returns 404', async () => {
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
      const ctx = createContext({}, user.id)
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
      expect(connectionDetails).toEqual({
        paymentTag: accountId,
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
        user.id
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
      expect(connectionDetails).toEqual({
        paymentTag: accountId,
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
      userId: string
    ): AppContext {
      reqOpts.headers = Object.assign(
        { accept: 'application/spsp4+json' },
        reqOpts.headers
      )
      const req = httpMocks.createRequest(reqOpts)
      const res = httpMocks.createResponse()
      const koa = new Koa<unknown, AppContextData>()
      const ctx = koa.createContext(req, res)
      ctx.params = { id: userId }
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
