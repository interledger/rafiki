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

  const setup = (
    reqOpts: httpMocks.RequestOptions,
    params: Record<string, unknown>
  ): AppContext => {
    const ctx = createContext(
      {
        headers: Object.assign(
          { Accept: 'application/json', 'Content-Type': 'application/json' },
          reqOpts.headers
        )
      },
      params
    )
    ctx.request.body = Object.assign(
      {
        incomingAmount:
          incomingPayment.incomingAmount === undefined
            ? undefined
            : {
                value: incomingPayment.incomingAmount.value.toString(),
                assetScale: incomingPayment.incomingAmount.assetScale,
                assetCode: incomingPayment.incomingAmount.assetCode
              },
        description: incomingPayment.description,
        externalRef: incomingPayment.externalRef,
        expiresAt: incomingPayment.expiresAt.toISOString()
      },
      reqOpts.body
    )
    if (reqOpts.query) ctx.request.query = reqOpts.query
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
    }
  )

  let asset: { code: string; scale: number }
  let account: Account
  let accountId: string
  let incomingPayment: IncomingPayment
  let incomingPayment2: IncomingPayment
  let incomingPayment3: IncomingPayment
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
    test.each`
      id              | headers                     | status | message               | description
      ${'not_a_uuid'} | ${null}                     | ${400} | ${'invalid id'}       | ${'invalid incoming payment id'}
      ${null}         | ${{ Accept: 'text/plain' }} | ${406} | ${'must accept json'} | ${'invalid Accept header'}
      ${uuid()}       | ${null}                     | ${404} | ${'Not Found'}        | ${'unknown incoming payment'}
    `(
      'returns $status on $description',
      async ({ id, headers, status, message }): Promise<void> => {
        const params = id
          ? { incomingPaymentId: id }
          : { incomingPaymentId: incomingPayment.id }
        const ctx = setup({ headers }, params)
        await expect(incomingPaymentRoutes.get(ctx)).rejects.toMatchObject({
          status,
          message
        })
      }
    )

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
        sharedSecret
      })
      const sharedSecretBuffer = Buffer.from(sharedSecret as string, 'base64')
      expect(sharedSecretBuffer).toHaveLength(32)
      expect(sharedSecret).toEqual(base64url(sharedSecretBuffer))
    })

    test('returns 500 if TB account not found', async (): Promise<void> => {
      jest
        .spyOn(accountingService, 'getAccountTotalReceived')
        .mockImplementationOnce(async (_args) => undefined)
      const ctx = createContext(
        {
          headers: { Accept: 'application/json' }
        },
        { incomingPaymentId: incomingPayment.id }
      )
      await expect(incomingPaymentRoutes.get(ctx)).rejects.toMatchObject({
        status: 500,
        message: `Underlying TB account not found, payment id: ${incomingPayment.id}`
      })
    })
  })
  describe('create', (): void => {
    test.each`
      id              | headers                             | body                                                                    | status | message                     | description
      ${'not_a_uuid'} | ${null}                             | ${null}                                                                 | ${400} | ${'invalid account id'}     | ${'invalid account id'}
      ${null}         | ${{ Accept: 'text/plain' }}         | ${null}                                                                 | ${406} | ${'must accept json'}       | ${'invalid Accept header'}
      ${null}         | ${{ 'Content-Type': 'text/plain' }} | ${null}                                                                 | ${400} | ${'must send json body'}    | ${'invalid Content-Type header'}
      ${uuid()}       | ${null}                             | ${null}                                                                 | ${404} | ${'unknown account'}        | ${'unknown account'}
      ${null}         | ${null}                             | ${{ incomingAmount: 'fail' }}                                           | ${400} | ${'invalid incomingAmount'} | ${'non-object incomingAmount'}
      ${null}         | ${null}                             | ${{ incomingAmount: { value: '-2', assetCode: 'USD', assetScale: 2 } }} | ${400} | ${'invalid amount'}         | ${'invalid incomingAmount, value non-positive'}
      ${null}         | ${null}                             | ${{ incomingAmount: { value: '2', assetCode: 4, assetScale: 2 } }}      | ${400} | ${'invalid incomingAmount'} | ${'invalid incomingAmount, assetCode not string'}
      ${null}         | ${null}                             | ${{ incomingAmount: { value: '2', assetCode: 'USD', assetScale: -2 } }} | ${400} | ${'invalid incomingAmount'} | ${'invalid incomingAmount, assetScale negative'}
      ${null}         | ${null}                             | ${{ description: 123 }}                                                 | ${400} | ${'invalid description'}    | ${'invalid description'}
      ${null}         | ${null}                             | ${{ externalRef: 123 }}                                                 | ${400} | ${'invalid externalRef'}    | ${'invalid externalRef'}
      ${null}         | ${null}                             | ${{ expiresAt: 'fail' }}                                                | ${400} | ${'invalid expiresAt'}      | ${'invalid expiresAt'}
      ${null}         | ${null}                             | ${{ expiresAt: new Date(Date.now() - 1).toISOString() }}                | ${400} | ${'already expired'}        | ${'already expired expiresAt'}
    `(
      'returns $status on $description',
      async ({ id, headers, body, status, message }): Promise<void> => {
        const params = id ? { accountId: id } : { accountId: account.id }
        const ctx = setup({ headers, body }, params)
        await expect(incomingPaymentRoutes.create(ctx)).rejects.toMatchObject({
          status,
          message
        })
      }
    )

    test('returns error on distant-future expiresAt', async (): Promise<void> => {
      const ctx = setup({}, { accountId: account.id })
      ctx.request.body['expiresAt'] = new Date(
        Date.now() + MAX_EXPIRY + 1000
      ).toISOString()
      await expect(incomingPaymentRoutes.create(ctx)).rejects.toHaveProperty(
        'message',
        'expiry too high'
      )
    })

    test('returns the incoming payment on success', async (): Promise<void> => {
      const ctx = setup({}, { accountId: account.id })
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
      expect(ctx.response.body).toEqual({
        id: `${accountId}/incoming-payments/${incomingPaymentId}`,
        accountId,
        incomingAmount: {
          value: incomingPayment.incomingAmount?.value.toString(),
          assetCode: incomingPayment.incomingAmount?.assetCode,
          assetScale: incomingPayment.incomingAmount?.assetScale
        },
        description: incomingPayment.description,
        expiresAt: expiresAt.toISOString(),
        receivedAmount: {
          value: '0',
          assetCode: incomingPayment.asset.code,
          assetScale: incomingPayment.asset.scale
        },
        externalRef: '#123',
        state: IncomingPaymentState.Pending.toLowerCase(),
        ilpAddress: expect.stringMatching(/^test\.rafiki\.[a-zA-Z0-9_-]{95}$/),
        sharedSecret
      })
    })

    test('returns the incoming payment on undefined incomingAmount', async (): Promise<void> => {
      const ctx = setup({}, { accountId: account.id })
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
      expect(ctx.response.body).toEqual({
        id: `${accountId}/incoming-payments/${incomingPaymentId}`,
        accountId,
        description: incomingPayment.description,
        expiresAt: expiresAt.toISOString(),
        receivedAmount: {
          value: '0',
          assetCode: incomingPayment.asset.code,
          assetScale: incomingPayment.asset.scale
        },
        externalRef: '#123',
        state: IncomingPaymentState.Pending.toLowerCase(),
        ilpAddress: expect.stringMatching(/^test\.rafiki\.[a-zA-Z0-9_-]{95}$/),
        sharedSecret
      })
    })
    test('returns the incoming payment on undefined description', async (): Promise<void> => {
      const ctx = setup({}, { accountId: account.id })
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
      expect(ctx.response.body).toEqual({
        id: `${accountId}/incoming-payments/${incomingPaymentId}`,
        accountId,
        incomingAmount: {
          value: incomingPayment.incomingAmount?.value.toString(),
          assetCode: incomingPayment.incomingAmount?.assetCode,
          assetScale: incomingPayment.incomingAmount?.assetScale
        },
        expiresAt: expiresAt.toISOString(),
        receivedAmount: {
          value: '0',
          assetCode: incomingPayment.asset.code,
          assetScale: incomingPayment.asset.scale
        },
        externalRef: '#123',
        state: IncomingPaymentState.Pending.toLowerCase(),
        ilpAddress: expect.stringMatching(/^test\.rafiki\.[a-zA-Z0-9_-]{95}$/),
        sharedSecret
      })
    })

    test('returns the incoming payment on undefined externalRef', async (): Promise<void> => {
      const ctx = setup({}, { accountId: account.id })
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
      expect(ctx.response.body).toEqual({
        id: `${accountId}/incoming-payments/${incomingPaymentId}`,
        accountId,
        incomingAmount: {
          value: incomingPayment.incomingAmount?.value.toString(),
          assetCode: incomingPayment.incomingAmount?.assetCode,
          assetScale: incomingPayment.incomingAmount?.assetScale
        },
        description: incomingPayment.description,
        expiresAt: expiresAt.toISOString(),
        receivedAmount: {
          value: '0',
          assetCode: incomingPayment.asset.code,
          assetScale: incomingPayment.asset.scale
        },
        state: IncomingPaymentState.Pending.toLowerCase(),
        ilpAddress: expect.stringMatching(/^test\.rafiki\.[a-zA-Z0-9_-]{95}$/),
        sharedSecret
      })
    })
  })

  describe('update', (): void => {
    test.each`
      id              | headers                             | body                      | status | message                  | description
      ${'not_a_uuid'} | ${null}                             | ${{ state: 'completed' }} | ${400} | ${'invalid id'}          | ${'invalid incoming payment id'}
      ${null}         | ${{ Accept: 'text/plain' }}         | ${{ state: 'completed' }} | ${406} | ${'must accept json'}    | ${'invalid Accept header'}
      ${null}         | ${{ 'Content-Type': 'text/plain' }} | ${{ state: 'completed' }} | ${400} | ${'must send json body'} | ${'invalid Content-Type header'}
      ${null}         | ${null}                             | ${{ state: 123 }}         | ${400} | ${'invalid state'}       | ${'invalid state type'}
      ${null}         | ${null}                             | ${{ state: 'foo' }}       | ${400} | ${'invalid state'}       | ${'invalid state value'}
      ${null}         | ${null}                             | ${{ state: 'expired' }}   | ${400} | ${'invalid state'}       | ${'invalid state'}
      ${uuid()}       | ${null}                             | ${{ state: 'completed' }} | ${404} | ${'unknown payment'}     | ${'unknown incoming payment'}
    `(
      'returns $status on $description',
      async ({ id, headers, body, status, message }): Promise<void> => {
        const params = id
          ? { incomingPaymentId: id }
          : { incomingPaymentId: incomingPayment.id }
        const ctx = setup({ headers, body }, params)
        await expect(incomingPaymentRoutes.update(ctx)).rejects.toMatchObject({
          status,
          message
        })
      }
    )

    test('returns 200 with an updated open payments incoming payment', async (): Promise<void> => {
      const ctx = setup(
        {
          headers: { Accept: 'application/json' },
          body: { state: 'completed' }
        },
        { incomingPaymentId: incomingPayment.id }
      )
      await expect(incomingPaymentRoutes.update(ctx)).resolves.toBeUndefined()
      expect(ctx.status).toBe(200)
      expect(ctx.response.get('Content-Type')).toBe(
        'application/json; charset=utf-8'
      )
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
        state: IncomingPaymentState.Completed.toLowerCase()
      })
    })
  })

  describe('list', (): void => {
    let result: Record<string, unknown>[]
    let paymentIds: string[]

    describe('failures', (): void => {
      test.each`
        id              | headers                     | first           | last            | cursor          | status | message                            | description
        ${'not_a_uuid'} | ${null}                     | ${'10'}         | ${null}         | ${null}         | ${400} | ${'invalid account id'}            | ${'invalid account id'}
        ${null}         | ${{ Accept: 'text/plain' }} | ${'10'}         | ${null}         | ${null}         | ${406} | ${'must accept json'}              | ${'invalid Accept header'}
        ${null}         | ${null}                     | ${['10', '20']} | ${null}         | ${null}         | ${400} | ${'invalid pagination parameters'} | ${'invalid pagination paramters'}
        ${null}         | ${null}                     | ${null}         | ${['10', '20']} | ${null}         | ${400} | ${'invalid pagination parameters'} | ${'invalid pagination paramters'}
        ${null}         | ${null}                     | ${'hello'}      | ${null}         | ${null}         | ${400} | ${'invalid pagination parameters'} | ${'invalid pagination paramters'}
        ${null}         | ${null}                     | ${null}         | ${null}         | ${['a', 'b']}   | ${400} | ${'invalid pagination parameters'} | ${'invalid pagination paramters'}
        ${null}         | ${null}                     | ${'10'}         | ${'10'}         | ${null}         | ${400} | ${'invalid pagination parameters'} | ${'invalid pagination paramters'}
        ${null}         | ${null}                     | ${null}         | ${'10'}         | ${undefined}    | ${400} | ${'invalid pagination parameters'} | ${'invalid pagination paramters'}
        ${null}         | ${null}                     | ${null}         | ${null}         | ${'not_a_uuid'} | ${400} | ${'invalid cursor'}                | ${'invalid cursor'}
      `(
        'returns $status on $description',
        async ({
          id,
          headers,
          first,
          last,
          cursor,
          status,
          message
        }): Promise<void> => {
          const params = id
            ? { accountId: id }
            : { accountId: incomingPayment.accountId }
          const query = {
            cursor: cursor === null ? incomingPayment.id : cursor
          }
          if (first) query['first'] = first
          if (last) query['last'] = last
          const ctx = setup({ headers, query }, params)
          await expect(incomingPaymentRoutes.list(ctx)).rejects.toMatchObject({
            status,
            message
          })
        }
      )
      test('returns 500 if one TB account not found', async (): Promise<void> => {
        jest
          .spyOn(accountingService, 'getAccountsTotalReceived')
          .mockImplementationOnce(async (_args) => {
            return {}
          })
        const ctx = setup({}, { accountId: incomingPayment.accountId })
        await expect(incomingPaymentRoutes.list(ctx)).rejects.toMatchObject({
          status: 500,
          message: `Underlying TB account not found, payment id: ${incomingPayment.id}`
        })
      })
    })

    describe('successes', (): void => {
      beforeEach(
        async (): Promise<void> => {
          incomingPayment2 = (await incomingPaymentService.create({
            accountId: account.id,
            description: '2nd incoming payment',
            expiresAt,
            incomingAmount: {
              value: BigInt(321),
              assetCode: asset.code,
              assetScale: asset.scale
            },
            externalRef: '#321'
          })) as IncomingPayment
          incomingPayment3 = (await incomingPaymentService.create({
            accountId: account.id,
            description: '3rd incoming payment',
            expiresAt,
            incomingAmount: {
              value: BigInt(213),
              assetCode: asset.code,
              assetScale: asset.scale
            },
            externalRef: '#213'
          })) as IncomingPayment
          paymentIds = [
            incomingPayment.id,
            incomingPayment2.id,
            incomingPayment3.id
          ]
          result = [
            {
              id: `https://wallet.example/${account.id}/incoming-payments/${incomingPayment.id}`,
              accountId: `https://wallet.example/${account.id}`,
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
              state: IncomingPaymentState.Pending.toLowerCase()
            },
            {
              id: `https://wallet.example/${account.id}/incoming-payments/${incomingPayment2.id}`,
              accountId: `https://wallet.example/${account.id}`,
              incomingAmount: {
                value: '321',
                assetCode: asset.code,
                assetScale: asset.scale
              },
              description: incomingPayment2.description,
              expiresAt: expiresAt.toISOString(),
              receivedAmount: {
                value: '0',
                assetCode: asset.code,
                assetScale: asset.scale
              },
              externalRef: '#321',
              state: IncomingPaymentState.Pending.toLowerCase()
            },
            {
              id: `https://wallet.example/${account.id}/incoming-payments/${incomingPayment3.id}`,
              accountId: `https://wallet.example/${account.id}`,
              incomingAmount: {
                value: '213',
                assetCode: asset.code,
                assetScale: asset.scale
              },
              description: incomingPayment3.description,
              expiresAt: expiresAt.toISOString(),
              receivedAmount: {
                value: '0',
                assetCode: asset.code,
                assetScale: asset.scale
              },
              externalRef: '#213',
              state: IncomingPaymentState.Pending.toLowerCase()
            }
          ]
        }
      )

      test.each`
        first   | last    | cursorIndex | pagination      | startIndex | endIndex | description
        ${null} | ${null} | ${-1}       | ${{ first: 3 }} | ${0}       | ${2}     | ${'no pagination parameters'}
        ${'10'} | ${null} | ${-1}       | ${{ first: 3 }} | ${0}       | ${2}     | ${'only `first`'}
        ${'10'} | ${null} | ${0}        | ${{ first: 2 }} | ${1}       | ${2}     | ${'`first` plus `cursor`'}
        ${null} | ${'10'} | ${2}        | ${{ last: 2 }}  | ${0}       | ${1}     | ${'`last` plus `cursor`'}
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
          const cursor = paymentIds[cursorIndex]
          const ctx = setup(
            {
              headers: { Accept: 'application/json' },
              query: { first, last, cursor }
            },
            { accountId: incomingPayment.accountId }
          )
          pagination['startCursor'] = paymentIds[startIndex]
          pagination['endCursor'] = paymentIds[endIndex]
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
    })
  })
})
