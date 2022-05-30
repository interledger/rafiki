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
  UpdateContext,
  ListContext
} from '../../../app'
import { truncateTables } from '../../../tests/tableManager'
import {
  IncomingPayment,
  IncomingPaymentJSON,
  IncomingPaymentState
} from './model'
import {
  IncomingPaymentRoutes,
  CreateBody,
  UpdateBody,
  MAX_EXPIRY
} from './routes'
import { AppContext } from '../../../app'
import { AccountingService } from '../../../accounting/service'
import { createIncomingPayment } from '../../../tests/incomingPayment'
import { Amount } from '@interledger/pay/dist/src/open-payments'

describe('Incoming Payment Routes', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let workerUtils: WorkerUtils
  let accountService: AccountService
  let accountingService: AccountingService
  let config: IAppConfig
  let incomingPaymentRoutes: IncomingPaymentRoutes
  const messageProducer = new GraphileProducer()
  const mockMessageProducer = {
    send: jest.fn()
  }

  const setup = <T extends AppContext>(
    reqOpts: httpMocks.RequestOptions,
    params: Record<string, string>
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
  let expiresAt: Date
  let incomingAmount: Amount
  let description: string
  let externalRef: string

  beforeEach(
    async (): Promise<void> => {
      accountService = await deps.use('accountService')
      config = await deps.use('config')
      incomingPaymentRoutes = await deps.use('incomingPaymentRoutes')

      expiresAt = new Date(Date.now() + 30_000)
      account = await accountService.create({ asset })
      accountId = `https://wallet.example/${account.id}`
      incomingAmount = {
        value: BigInt('123'),
        assetScale: asset.scale,
        assetCode: asset.code
      }
      description = 'hello world'
      externalRef = '#123'
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
    let incomingPayment: IncomingPayment
    beforeEach(
      async (): Promise<void> => {
        incomingPayment = await createIncomingPayment(deps, {
          accountId: account.id,
          description,
          expiresAt,
          incomingAmount,
          externalRef
        })
      }
    )

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
        createdAt: incomingPayment.createdAt.toISOString(),
        updatedAt: incomingPayment.updatedAt.toISOString(),
        receivedAmount: {
          value: '0',
          assetCode: asset.code,
          assetScale: asset.scale
        },
        externalRef: '#123',
        state: IncomingPaymentState.Pending.toLowerCase(),
        ilpAddress: expect.stringMatching(/^test\.rafiki\.[a-zA-Z0-9_-]{95}$/),
        sharedSecret
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
            assetCode: asset.code,
            assetScale: asset.scale
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
    let incomingPayment: IncomingPayment
    beforeEach(
      async (): Promise<void> => {
        incomingPayment = await createIncomingPayment(deps, {
          accountId: account.id,
          description,
          expiresAt,
          incomingAmount,
          externalRef
        })
      }
    )
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

  describe.only('list', (): void => {
    let items: IncomingPayment[]
    let result: Omit<IncomingPaymentJSON, 'incomingAmount' | 'externalRef'>[]
    beforeEach(
      async (): Promise<void> => {
        items = []
        for (let i = 0; i < 3; i++) {
          const ip = await createIncomingPayment(deps, {
            accountId: account.id,
            description: `p${i}`,
            expiresAt
          })
          items.push(ip)
        }
        result = [0, 1, 2].map((i) => {
          return {
            id: `${accountId}/incoming-payments/${items[i].id}`,
            accountId,
            receivedAmount: {
              value: '0',
              assetCode: asset.code,
              assetScale: asset.scale
            },
            description: items[i]['description'] ?? null,
            state: 'pending',
            expiresAt: expiresAt.toISOString(),
            createdAt: items[i].createdAt.toISOString(),
            updatedAt: items[i].updatedAt.toISOString()
          }
        })
      }
    )
    test.each`
      first   | last    | cursorIndex | pagination                                                  | startIndex | endIndex | description
      ${null} | ${null} | ${-1}       | ${{ first: 3, hasPreviousPage: false, hasNextPage: false }} | ${0}       | ${2}     | ${'no pagination parameters'}
      ${10}   | ${null} | ${-1}       | ${{ first: 3, hasPreviousPage: false, hasNextPage: false }} | ${0}       | ${2}     | ${'only `first`'}
      ${10}   | ${null} | ${0}        | ${{ first: 2, hasPreviousPage: true, hasNextPage: false }}  | ${1}       | ${2}     | ${'`first` plus `cursor`'}
      ${null} | ${10}   | ${2}        | ${{ last: 2, hasPreviousPage: false, hasNextPage: true }}   | ${0}       | ${1}     | ${'`last` plus `cursor`'}
    `(
      'returns 200 on $description',
      async ({
        first,
        last,
        cursorIndex,
        pagination,
        startIndex,
        endIndex
      }): Promise<void> => {
        const cursor = items[cursorIndex] ? items[cursorIndex].id : null
        pagination['startCursor'] = items[startIndex].id
        pagination['endCursor'] = items[endIndex].id
        const ctx = setup<ListContext>(
          {
            headers: { Accept: 'application/json' },
            method: 'GET',
            query: { first, last, cursor }
          },
          { accountId: account.id }
        )
        await expect(incomingPaymentRoutes.list(ctx)).resolves.toBeUndefined()
        expect(ctx.status).toBe(200)
        expect(ctx.response.get('Content-Type')).toBe(
          'application/json; charset=utf-8'
        )
        expect(ctx.body).toEqual({
          pagination,
          result: result.slice(startIndex, endIndex + 1)
        })
      }
    )

    test('returns 500 if TB account not found', async (): Promise<void> => {
      jest
        .spyOn(accountingService, 'getAccountsTotalReceived')
        .mockResolvedValueOnce([undefined])
      const ctx = createContext<ListContext>(
        {
          headers: { Accept: 'application/json' }
        },
        { accountId: account.id }
      )
      await expect(incomingPaymentRoutes.list(ctx)).rejects.toMatchObject({
        status: 500,
        message: `Error trying to list incoming payments`
      })
    })
  })
})
