import * as httpMocks from 'node-mocks-http'
import base64url from 'base64url'
import Knex from 'knex'
import { WorkerUtils, makeWorkerUtils } from 'graphile-worker'
import { v4 as uuid } from 'uuid'

import { createContext } from '../../../tests/context'
import { AccountService } from '../../account/service'
import { Account } from '../../account/model'
import { createTestApp, TestContainer } from '../../../tests/app'
import { resetGraphileDb } from '../../../tests/graphileDb'
import { GraphileProducer } from '../../../messaging/graphileProducer'
import { Config, IAppConfig } from '../../../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../..'
import { AppServices } from '../../../app'
import { truncateTables } from '../../../tests/tableManager'
import { randomAsset } from '../../../tests/asset'
import { IncomingPaymentService } from './service'
import { IncomingPayment, IncomingPaymentState } from './model'
import { IncomingPaymentRoutes, MAX_EXPIRY } from './routes'
import { AppContext } from '../../../app'
import { isIncomingPaymentError } from './errors'

describe('Incoming Payment Routes', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let workerUtils: WorkerUtils
  let accountService: AccountService
  let incomingPaymentService: IncomingPaymentService
  let config: IAppConfig
  let incomingPaymentRoutes: IncomingPaymentRoutes
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
  let account: Account
  let incomingPayment: IncomingPayment
  let expiresAt: Date

  beforeEach(
    async (): Promise<void> => {
      accountService = await deps.use('accountService')
      incomingPaymentService = await deps.use('incomingPaymentService')
      config = await deps.use('config')
      incomingPaymentRoutes = await deps.use('incomingPaymentRoutes')

      asset = randomAsset()
      expiresAt = new Date(Date.now() + 30_000)
      account = await accountService.create({ asset })
      const incomingPaymentOrError = await incomingPaymentService.create({
        accountId: account.id,
        description: 'text',
        expiresAt,
        incomingAmount: {
          amount: BigInt(123),
          assetCode: asset.code,
          assetScale: asset.scale
        },
        externalRef: '#123',
        receiptsEnabled: false
      })
      if (!isIncomingPaymentError(incomingPaymentOrError)) {
        incomingPayment = incomingPaymentOrError
      }
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
        { incomingPaymentId: 'not_a_uuid' }
      )
      await expect(incomingPaymentRoutes.get(ctx)).rejects.toHaveProperty(
        'message',
        'invalid id'
      )
    })

    test('returns 406 for wrong Accept', async (): Promise<void> => {
      const ctx = createContext(
        {
          headers: { Accept: 'test/plain' }
        },
        { incomingPaymentId: uuid() }
      )
      await expect(incomingPaymentRoutes.get(ctx)).rejects.toHaveProperty(
        'status',
        406
      )
    })

    test('returns 404 for nonexistent incoming payment', async (): Promise<void> => {
      const ctx = createContext(
        {
          headers: { Accept: 'application/json' }
        },
        { incomingPaymentId: uuid() }
      )
      await expect(incomingPaymentRoutes.get(ctx)).rejects.toHaveProperty(
        'status',
        404
      )
    })

    test('returns 200 with an open payments incoming payment', async (): Promise<void> => {
      const ctx = createContext(
        {
          headers: { Accept: 'application/json' }
        },
        { incomingPaymentId: incomingPayment.id }
      )
      await expect(incomingPaymentRoutes.get(ctx)).resolves.toBeUndefined()
      expect(ctx.status).toBe(200)
      expect(ctx.response.get('Content-Type')).toBe(
        'application/json; charset=utf-8'
      )

      const sharedSecret = (ctx.response.body as Record<string, unknown>)[
        'sharedSecret'
      ]

      expect(ctx.body).toEqual({
        id: `https://wallet.example/incoming-payments/${incomingPayment.id}`,
        accountId: `https://wallet.example/pay/${account.id}`,
        incomingAmount: {
          amount: '123',
          assetCode: asset.code,
          assetScale: asset.scale
        },
        description: incomingPayment.description,
        expiresAt: expiresAt.toISOString(),
        receivedAmount: {
          amount: '0',
          assetCode: asset.code,
          assetScale: asset.scale
        },
        externalRef: '#123',
        state: IncomingPaymentState.Pending.toLowerCase(),
        receiptsEnabled: incomingPayment.receiptsEnabled,
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
        { accountId: account.id }
      )
      ctx.request.body = {
        incomingAmount: incomingPayment.incomingAmount,
        description: incomingPayment.description,
        externalRef: incomingPayment.externalRef,
        expiresAt: incomingPayment.expiresAt.toISOString()
      }
      return ctx
    }

    test('returns error on invalid id', async (): Promise<void> => {
      const ctx = setup({})
      ctx.params.accountId = 'not_a_uuid'
      await expect(incomingPaymentRoutes.create(ctx)).rejects.toHaveProperty(
        'message',
        'invalid account id'
      )
    })

    test('returns 406 on invalid Accept', async (): Promise<void> => {
      const ctx = setup({ headers: { Accept: 'text/plain' } })
      await expect(incomingPaymentRoutes.create(ctx)).rejects.toHaveProperty(
        'status',
        406
      )
    })

    test('returns error on invalid Content-Type', async (): Promise<void> => {
      const ctx = setup({ headers: { 'Content-Type': 'text/plain' } })
      await expect(incomingPaymentRoutes.create(ctx)).rejects.toHaveProperty(
        'message',
        'must send json body'
      )
    })

    test('returns error on invalid incomingAmount', async (): Promise<void> => {
      const ctx = setup({})
      ctx.request.body['incomingAmount'] = 'fail'
      await expect(incomingPaymentRoutes.create(ctx)).rejects.toHaveProperty(
        'message',
        'invalid incomingAmount'
      )
    })

    test('returns error on invalid description', async (): Promise<void> => {
      const ctx = setup({})
      ctx.request.body['description'] = 123
      await expect(incomingPaymentRoutes.create(ctx)).rejects.toHaveProperty(
        'message',
        'invalid description'
      )
    })

    test('returns error on invalid externalRef', async (): Promise<void> => {
      const ctx = setup({})
      ctx.request.body['externalRef'] = 123
      await expect(incomingPaymentRoutes.create(ctx)).rejects.toHaveProperty(
        'message',
        'invalid externalRef'
      )
    })

    test('returns error on invalid receiptsEnabled flag', async (): Promise<void> => {
      const ctx = setup({})
      ctx.request.body['receiptsEnabled'] = 'yes'
      await expect(incomingPaymentRoutes.create(ctx)).rejects.toHaveProperty(
        'message',
        'invalid receiptsEnabled flag'
      )
    })

    test('returns error on invalid expiresAt', async (): Promise<void> => {
      const ctx = setup({})
      ctx.request.body['expiresAt'] = 'fail'
      await expect(incomingPaymentRoutes.create(ctx)).rejects.toHaveProperty(
        'message',
        'invalid expiresAt'
      )
    })

    test('returns error on distant-future expiresAt', async (): Promise<void> => {
      const ctx = setup({})
      ctx.request.body['expiresAt'] = new Date(
        Date.now() + MAX_EXPIRY + 1000
      ).toISOString()
      await expect(incomingPaymentRoutes.create(ctx)).rejects.toHaveProperty(
        'message',
        'expiry too high'
      )
    })

    test('returns error on already-expired expiresAt', async (): Promise<void> => {
      const ctx = setup({})
      ctx.request.body['expiresAt'] = new Date(Date.now() - 1).toISOString()
      await expect(incomingPaymentRoutes.create(ctx)).rejects.toHaveProperty(
        'message',
        'already expired'
      )
    })

    test('returns the incoming payment on success', async (): Promise<void> => {
      const ctx = setup({})
      await expect(incomingPaymentRoutes.create(ctx)).resolves.toBeUndefined()
      expect(ctx.response.status).toBe(201)
      const sharedSecret = (ctx.response.body as Record<string, unknown>)[
        'sharedSecret'
      ]
      const incomingPaymentId = ((ctx.response.body as Record<string, unknown>)[
        'id'
      ] as string)
        .split('/')
        .pop()
      expect(ctx.response.headers['location']).toBe(
        `${config.publicHost}/incoming-payments/${incomingPaymentId}`
      )
      expect(ctx.response.body).toEqual({
        id: `${config.publicHost}/incoming-payments/${incomingPaymentId}`,
        accountId: `${config.publicHost}/pay/${incomingPayment.accountId}`,
        incomingAmount: {
          amount: incomingPayment.incomingAmount?.amount.toString(),
          assetCode: incomingPayment.incomingAmount?.assetCode,
          assetScale: incomingPayment.incomingAmount?.assetScale
        },
        description: incomingPayment.description,
        expiresAt: expiresAt.toISOString(),
        receivedAmount: {
          amount: '0',
          assetCode: incomingPayment.account.asset.code,
          assetScale: incomingPayment.account.asset.scale
        },
        externalRef: '#123',
        state: IncomingPaymentState.Pending.toLowerCase(),
        receiptsEnabled: incomingPayment.receiptsEnabled,
        ilpAddress: expect.stringMatching(/^test\.rafiki\.[a-zA-Z0-9_-]{95}$/),
        sharedSecret
      })
    })

    test('returns the incoming payment on undefined incomingAmount', async (): Promise<void> => {
      const ctx = setup({})
      ctx.request.body['incomingAmount'] = undefined
      await expect(incomingPaymentRoutes.create(ctx)).resolves.toBeUndefined()
      expect(ctx.response.status).toBe(201)
      const sharedSecret = (ctx.response.body as Record<string, unknown>)[
        'sharedSecret'
      ]
      const incomingPaymentId = ((ctx.response.body as Record<string, unknown>)[
        'id'
      ] as string)
        .split('/')
        .pop()
      expect(ctx.response.headers['location']).toBe(
        `${config.publicHost}/incoming-payments/${incomingPaymentId}`
      )
      expect(ctx.response.body).toEqual({
        id: `${config.publicHost}/incoming-payments/${incomingPaymentId}`,
        accountId: `${config.publicHost}/pay/${incomingPayment.accountId}`,
        description: incomingPayment.description,
        expiresAt: expiresAt.toISOString(),
        receivedAmount: {
          amount: '0',
          assetCode: incomingPayment.account.asset.code,
          assetScale: incomingPayment.account.asset.scale
        },
        externalRef: '#123',
        state: IncomingPaymentState.Pending.toLowerCase(),
        receiptsEnabled: incomingPayment.receiptsEnabled,
        ilpAddress: expect.stringMatching(/^test\.rafiki\.[a-zA-Z0-9_-]{95}$/),
        sharedSecret
      })
    })
    test('returns the incoming payment on undefined description', async (): Promise<void> => {
      const ctx = setup({})
      ctx.request.body['description'] = undefined
      await expect(incomingPaymentRoutes.create(ctx)).resolves.toBeUndefined()
      expect(ctx.response.status).toBe(201)
      const sharedSecret = (ctx.response.body as Record<string, unknown>)[
        'sharedSecret'
      ]
      const incomingPaymentId = ((ctx.response.body as Record<string, unknown>)[
        'id'
      ] as string)
        .split('/')
        .pop()
      expect(ctx.response.headers['location']).toBe(
        `${config.publicHost}/incoming-payments/${incomingPaymentId}`
      )
      expect(ctx.response.body).toEqual({
        id: `${config.publicHost}/incoming-payments/${incomingPaymentId}`,
        accountId: `${config.publicHost}/pay/${incomingPayment.accountId}`,
        incomingAmount: {
          amount: incomingPayment.incomingAmount?.amount.toString(),
          assetCode: incomingPayment.incomingAmount?.assetCode,
          assetScale: incomingPayment.incomingAmount?.assetScale
        },
        expiresAt: expiresAt.toISOString(),
        receivedAmount: {
          amount: '0',
          assetCode: incomingPayment.account.asset.code,
          assetScale: incomingPayment.account.asset.scale
        },
        externalRef: '#123',
        state: IncomingPaymentState.Pending.toLowerCase(),
        receiptsEnabled: incomingPayment.receiptsEnabled,
        ilpAddress: expect.stringMatching(/^test\.rafiki\.[a-zA-Z0-9_-]{95}$/),
        sharedSecret
      })
    })

    test('returns the incoming payment on undefined externalRef', async (): Promise<void> => {
      const ctx = setup({})
      ctx.request.body['externalRef'] = undefined
      await expect(incomingPaymentRoutes.create(ctx)).resolves.toBeUndefined()
      expect(ctx.response.status).toBe(201)
      const sharedSecret = (ctx.response.body as Record<string, unknown>)[
        'sharedSecret'
      ]
      const incomingPaymentId = ((ctx.response.body as Record<string, unknown>)[
        'id'
      ] as string)
        .split('/')
        .pop()
      expect(ctx.response.headers['location']).toBe(
        `${config.publicHost}/incoming-payments/${incomingPaymentId}`
      )
      expect(ctx.response.body).toEqual({
        id: `${config.publicHost}/incoming-payments/${incomingPaymentId}`,
        accountId: `${config.publicHost}/pay/${incomingPayment.accountId}`,
        incomingAmount: {
          amount: incomingPayment.incomingAmount?.amount.toString(),
          assetCode: incomingPayment.incomingAmount?.assetCode,
          assetScale: incomingPayment.incomingAmount?.assetScale
        },
        description: incomingPayment.description,
        expiresAt: expiresAt.toISOString(),
        receivedAmount: {
          amount: '0',
          assetCode: incomingPayment.account.asset.code,
          assetScale: incomingPayment.account.asset.scale
        },
        state: IncomingPaymentState.Pending.toLowerCase(),
        receiptsEnabled: incomingPayment.receiptsEnabled,
        ilpAddress: expect.stringMatching(/^test\.rafiki\.[a-zA-Z0-9_-]{95}$/),
        sharedSecret
      })
    })

    test('returns the incoming payment on undefined receiptsEnabled flag', async (): Promise<void> => {
      const ctx = setup({})
      ctx.request.body['receiptsEnabled'] = undefined
      await expect(incomingPaymentRoutes.create(ctx)).resolves.toBeUndefined()
      expect(ctx.response.status).toBe(201)
      const sharedSecret = (ctx.response.body as Record<string, unknown>)[
        'sharedSecret'
      ]
      const incomingPaymentId = ((ctx.response.body as Record<string, unknown>)[
        'id'
      ] as string)
        .split('/')
        .pop()
      expect(ctx.response.headers['location']).toBe(
        `${config.publicHost}/incoming-payments/${incomingPaymentId}`
      )
      expect(ctx.response.body).toEqual({
        id: `${config.publicHost}/incoming-payments/${incomingPaymentId}`,
        accountId: `${config.publicHost}/pay/${incomingPayment.accountId}`,
        incomingAmount: {
          amount: incomingPayment.incomingAmount?.amount.toString(),
          assetCode: incomingPayment.incomingAmount?.assetCode,
          assetScale: incomingPayment.incomingAmount?.assetScale
        },
        description: incomingPayment.description,
        expiresAt: expiresAt.toISOString(),
        receivedAmount: {
          amount: '0',
          assetCode: incomingPayment.account.asset.code,
          assetScale: incomingPayment.account.asset.scale
        },
        externalRef: '#123',
        state: IncomingPaymentState.Pending.toLowerCase(),
        receiptsEnabled: false,
        ilpAddress: expect.stringMatching(/^test\.rafiki\.[a-zA-Z0-9_-]{95}$/),
        sharedSecret
      })
    })
  })
})
