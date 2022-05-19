import * as httpMocks from 'node-mocks-http'
import jestOpenAPI from 'jest-openapi'
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
import {
  AppServices,
  ReadContext,
  CreateContext,
  UpdateContext
} from '../../../app'
import { truncateTables } from '../../../tests/tableManager'
import { IncomingPaymentService } from './service'
import { IncomingPayment, IncomingPaymentState } from './model'
import {
  IncomingPaymentRoutes,
  CreateBody,
  UpdateBody,
  MAX_EXPIRY
} from './routes'
import { AppContext } from '../../../app'
import { isIncomingPaymentError } from './errors'
import { AccountingService } from '../../../accounting/service'

describe('Incoming Payment Routes', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let workerUtils: WorkerUtils
  let accountService: AccountService
  let accountingService: AccountingService
  let incomingPaymentService: IncomingPaymentService
  let config: IAppConfig
  let incomingPaymentRoutes: IncomingPaymentRoutes
  const messageProducer = new GraphileProducer()
  const mockMessageProducer = {
    send: jest.fn()
  }

  const setup = <T extends AppContext>(
    reqOpts: httpMocks.RequestOptions,
    params: Record<string, unknown>
  ): T => {
    const ctx = createContext<T>(
      {
        ...reqOpts,
        headers: Object.assign(
          { Accept: 'application/json', 'Content-Type': 'application/json' },
          reqOpts.headers
        )
      },
      params
    )
    if (reqOpts.body !== undefined) {
      ctx.request.body = reqOpts.body
    }

    return ctx
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
      accountingService = await deps.use('accountingService')
      jestOpenAPI(await deps.use('openApi'))
    }
  )

  const asset = {
    code: 'USD',
    scale: 2
  }
  let account: Account
  let accountId: string
  let incomingPayment: IncomingPayment
  let expiresAt: Date

  beforeEach(
    async (): Promise<void> => {
      accountService = await deps.use('accountService')
      incomingPaymentService = await deps.use('incomingPaymentService')
      config = await deps.use('config')
      incomingPaymentRoutes = await deps.use('incomingPaymentRoutes')

      expiresAt = new Date(Date.now() + 30_000)
      account = await accountService.create({ asset })
      accountId = `https://wallet.example/${account.id}`
      const incomingPaymentOrError = await incomingPaymentService.create({
        accountId: account.id,
        description: 'text',
        expiresAt,
        incomingAmount: {
          value: BigInt(123),
          assetCode: asset.code,
          assetScale: asset.scale
        },
        externalRef: '#123'
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
    test('returns 404 on unknown incoming payment', async (): Promise<void> => {
      const ctx = createContext<ReadContext>(
        {
          headers: { Accept: 'application/json' }
        },
        {
          id: uuid(),
          accountId: account.id
        }
      )
      await expect(incomingPaymentRoutes.get(ctx)).rejects.toMatchObject({
        status: 404,
        message: 'Not Found'
      })
    })

    test('returns 200 with an open payments incoming payment', async (): Promise<void> => {
      const ctx = createContext<ReadContext>(
        {
          headers: { Accept: 'application/json' },
          method: 'GET',
          url: `/${account.id}/incoming-payments/${incomingPayment.id}`
        },
        {
          id: incomingPayment.id,
          accountId: account.id
        }
      )
      await expect(incomingPaymentRoutes.get(ctx)).resolves.toBeUndefined()
      expect(ctx.response).toSatisfyApiSpec()

      const sharedSecret = (ctx.response.body as Record<string, unknown>)[
        'sharedSecret'
      ]

      expect(ctx.body).toEqual({
        id: `${accountId}/incoming-payments/${incomingPayment.id}`,
        accountId,
        incomingAmount: {
          value: '123',
          assetCode: asset.code,
          assetScale: asset.scale
        },
        description: incomingPayment.description,
        expiresAt: expiresAt.toISOString(),
        receivedAmount: {
          value: '0',
          assetCode: asset.code,
          assetScale: asset.scale
        },
        externalRef: '#123',
        state: IncomingPaymentState.Pending.toLowerCase(),
        ilpAddress: expect.stringMatching(/^test\.rafiki\.[a-zA-Z0-9_-]{95}$/),
        sharedSecret,
        createdAt: incomingPayment.createdAt.toISOString(),
        updatedAt: incomingPayment.updatedAt.toISOString()
      })
      const sharedSecretBuffer = Buffer.from(sharedSecret as string, 'base64')
      expect(sharedSecretBuffer).toHaveLength(32)
      expect(sharedSecret).toEqual(base64url(sharedSecretBuffer))
    })

    test('returns 500 if TB account not found', async (): Promise<void> => {
      jest
        .spyOn(accountingService, 'getTotalReceived')
        .mockResolvedValueOnce(undefined)
      const ctx = createContext<ReadContext>(
        {
          headers: { Accept: 'application/json' }
        },
        {
          id: incomingPayment.id,
          accountId: account.id
        }
      )
      await expect(incomingPaymentRoutes.get(ctx)).rejects.toMatchObject({
        status: 500,
        message: `Error trying to get incoming payment`
      })
    })
  })
  describe('create', (): void => {
    test('returns error on distant-future expiresAt', async (): Promise<void> => {
      const ctx = setup<CreateContext<CreateBody>>(
        { body: {} },
        { accountId: account.id }
      )
      ctx.request.body['expiresAt'] = new Date(
        Date.now() + MAX_EXPIRY + 1000
      ).toISOString()
      await expect(incomingPaymentRoutes.create(ctx)).rejects.toHaveProperty(
        'message',
        'expiry too high'
      )
    })

    test.each`
      incomingAmount                                     | description  | externalRef  | expiresAt
      ${{ value: '2', assetCode: 'USD', assetScale: 2 }} | ${'text'}    | ${'#123'}    | ${new Date(Date.now() + 30_000).toISOString()}
      ${undefined}                                       | ${undefined} | ${undefined} | ${undefined}
    `(
      'returns the incoming payment on success',
      async ({
        incomingAmount,
        description,
        externalRef,
        expiresAt
      }): Promise<void> => {
        const ctx = setup<CreateContext<CreateBody>>(
          {
            body: {
              incomingAmount,
              description,
              externalRef,
              expiresAt
            },
            method: 'POST',
            url: `/${account.id}/incoming-payments`
          },
          { accountId: account.id }
        )
        await expect(incomingPaymentRoutes.create(ctx)).resolves.toBeUndefined()
        expect(ctx.response).toSatisfyApiSpec()
        const sharedSecret = (ctx.response.body as Record<string, unknown>)[
          'sharedSecret'
        ]
        const incomingPaymentId = ((ctx.response.body as Record<
          string,
          unknown
        >)['id'] as string)
          .split('/')
          .pop()
        expect(ctx.response.body).toEqual({
          id: `${accountId}/incoming-payments/${incomingPaymentId}`,
          accountId,
          incomingAmount,
          description,
          expiresAt: expiresAt || expect.any(String),
          receivedAmount: {
            value: '0',
            assetCode: incomingPayment.asset.code,
            assetScale: incomingPayment.asset.scale
          },
          externalRef,
          state: IncomingPaymentState.Pending.toLowerCase(),
          ilpAddress: expect.stringMatching(
            /^test\.rafiki\.[a-zA-Z0-9_-]{95}$/
          ),
          sharedSecret,
          createdAt: expect.any(String),
          updatedAt: expect.any(String)
        })
      }
    )
  })

  describe('update', (): void => {
    test('returns 200 with an updated open payments incoming payment', async (): Promise<void> => {
      const ctx = setup<UpdateContext<UpdateBody>>(
        {
          headers: { Accept: 'application/json' },
          body: { state: 'completed' },
          method: 'PUT',
          url: `/${account.id}/incoming-payments/${incomingPayment.id}`
        },
        {
          id: incomingPayment.id,
          accountId: account.id
        }
      )
      await expect(incomingPaymentRoutes.update(ctx)).resolves.toBeUndefined()
      expect(ctx.response).toSatisfyApiSpec()
      expect(ctx.body).toEqual({
        id: `${accountId}/incoming-payments/${incomingPayment.id}`,
        accountId,
        incomingAmount: {
          value: '123',
          assetCode: asset.code,
          assetScale: asset.scale
        },
        description: incomingPayment.description,
        expiresAt: expiresAt.toISOString(),
        receivedAmount: {
          value: '0',
          assetCode: asset.code,
          assetScale: asset.scale
        },
        externalRef: '#123',
        state: IncomingPaymentState.Completed.toLowerCase(),
        createdAt: incomingPayment.createdAt.toISOString(),
        updatedAt: expect.any(String)
      })
    })
  })
})
