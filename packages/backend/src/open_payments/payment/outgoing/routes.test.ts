import * as Pay from '@interledger/pay'
import assert from 'assert'
import * as httpMocks from 'node-mocks-http'
import Knex from 'knex'
import { WorkerUtils, makeWorkerUtils } from 'graphile-worker'
import { v4 as uuid } from 'uuid'

import { createContext } from '../../../tests/context'
import { createTestApp, TestContainer } from '../../../tests/app'
import { resetGraphileDb } from '../../../tests/graphileDb'
import { GraphileProducer } from '../../../messaging/graphileProducer'
import { Config, IAppConfig } from '../../../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../..'
import { AppServices } from '../../../app'
import { truncateTables } from '../../../tests/tableManager'
import { randomAsset } from '../../../tests/asset'
import { OutgoingPaymentService, CreateOutgoingPaymentOptions } from './service'
import { isOutgoingPaymentError } from './errors'
import { OutgoingPayment, OutgoingPaymentState } from './model'
import { OutgoingPaymentRoutes } from './routes'
import { Amount } from '../amount'
import { AppContext } from '../../../app'

describe('Outgoing Payment Routes', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let workerUtils: WorkerUtils
  let outgoingPaymentService: OutgoingPaymentService
  let config: IAppConfig
  let outgoingPaymentRoutes: OutgoingPaymentRoutes
  let accountId: string
  let accountUrl: string

  const messageProducer = new GraphileProducer()
  const mockMessageProducer = {
    send: jest.fn()
  }
  const receivingAccount = `https://wallet.example/${uuid()}`
  const receivingPayment = `${receivingAccount}/incoming-payments/${uuid()}`
  const asset = randomAsset()
  const sendAmount: Amount = {
    value: BigInt(123),
    assetCode: asset.code,
    assetScale: asset.scale
  }
  const receiveAmount: Amount = {
    value: BigInt(56),
    assetCode: asset.code,
    assetScale: asset.scale
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
      outgoingPaymentService = await deps.use('outgoingPaymentService')
      config = await deps.use('config')
      outgoingPaymentRoutes = await deps.use('outgoingPaymentRoutes')
    }
  )

  beforeEach(
    async (): Promise<void> => {
      const accountService = await deps.use('accountService')
      accountId = (await accountService.create({ asset })).id
      accountUrl = `${config.publicHost}/${accountId}`
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
        { outgoingPaymentId: 'not_a_uuid' }
      )
      await expect(outgoingPaymentRoutes.get(ctx)).rejects.toHaveProperty(
        'message',
        'invalid id'
      )
    })

    test('returns 406 for wrong Accept', async (): Promise<void> => {
      const ctx = createContext(
        {
          headers: { Accept: 'test/plain' }
        },
        { outgoingPaymentId: uuid() }
      )
      await expect(outgoingPaymentRoutes.get(ctx)).rejects.toHaveProperty(
        'status',
        406
      )
    })

    test('returns 404 for nonexistent outgoing payment', async (): Promise<void> => {
      const ctx = createContext(
        {
          headers: { Accept: 'application/json' }
        },
        { outgoingPaymentId: uuid() }
      )
      await expect(outgoingPaymentRoutes.get(ctx)).rejects.toHaveProperty(
        'status',
        404
      )
    })

    test.each`
      sendAmount    | receiveAmount    | description
      ${sendAmount} | ${undefined}     | ${'fixed-send'}
      ${undefined}  | ${receiveAmount} | ${'fixed-receive'}
    `(
      'returns 200 with a $description open payments outgoing payment',
      async ({ sendAmount, receiveAmount }): Promise<void> => {
        const outgoingPayment = await outgoingPaymentService.create({
          accountId,
          receivingAccount,
          sendAmount,
          receiveAmount
        })
        assert.ok(!isOutgoingPaymentError(outgoingPayment))
        const ctx = createContext(
          {
            headers: { Accept: 'application/json' }
          },
          { outgoingPaymentId: outgoingPayment.id }
        )
        await expect(outgoingPaymentRoutes.get(ctx)).resolves.toBeUndefined()
        expect(ctx.status).toBe(200)
        expect(ctx.response.get('Content-Type')).toBe(
          'application/json; charset=utf-8'
        )

        expect(ctx.body).toEqual({
          id: `${accountUrl}/outgoing-payments/${outgoingPayment.id}`,
          accountId: accountUrl,
          receivingAccount,
          sendAmount: sendAmount && {
            ...sendAmount,
            value: sendAmount.value.toString()
          },
          receiveAmount: receiveAmount && {
            ...receiveAmount,
            value: receiveAmount.value.toString()
          },
          state: OutgoingPaymentState.Pending.toLowerCase()
        })
      }
    )

    test('returns 200 with a quoted outgoing payment to an incoming payment', async (): Promise<void> => {
      const outgoingPayment = await outgoingPaymentService.create({
        accountId,
        receivingPayment,
        description: 'rent',
        externalRef: '202201'
      })
      assert.ok(!isOutgoingPaymentError(outgoingPayment))
      await outgoingPayment.$query(knex).patch({
        state: OutgoingPaymentState.Funding,
        sendAmount,
        receiveAmount,
        quote: {
          timestamp: new Date(),
          targetType: Pay.PaymentType.FixedSend,
          maxPacketAmount: BigInt(789),
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          minExchangeRate: Pay.Ratio.from(1.23)!,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          lowExchangeRateEstimate: Pay.Ratio.from(1.2)!,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          highExchangeRateEstimate: Pay.Ratio.from(2.3)!
        }
      })
      const ctx = createContext(
        {
          headers: { Accept: 'application/json' }
        },
        { outgoingPaymentId: outgoingPayment.id }
      )
      await expect(outgoingPaymentRoutes.get(ctx)).resolves.toBeUndefined()
      expect(ctx.status).toBe(200)
      expect(ctx.response.get('Content-Type')).toBe(
        'application/json; charset=utf-8'
      )

      expect(ctx.body).toEqual({
        id: `${accountUrl}/outgoing-payments/${outgoingPayment.id}`,
        accountId: accountUrl,
        receivingPayment,
        sendAmount: {
          ...sendAmount,
          value: sendAmount.value.toString()
        },
        receiveAmount: {
          ...receiveAmount,
          value: receiveAmount.value.toString()
        },
        state: 'processing',
        description: outgoingPayment.description,
        externalRef: outgoingPayment.externalRef
      })
    })

    Object.values(OutgoingPaymentState).forEach((state) => {
      test(`returns 200 with a(n) ${state} outgoing payment`, async (): Promise<void> => {
        const outgoingPayment = await outgoingPaymentService.create({
          accountId,
          receivingPayment
        })
        assert.ok(!isOutgoingPaymentError(outgoingPayment))
        await outgoingPayment.$query(knex).patch({ state })
        const ctx = createContext(
          {
            headers: { Accept: 'application/json' }
          },
          { outgoingPaymentId: outgoingPayment.id }
        )
        await expect(outgoingPaymentRoutes.get(ctx)).resolves.toBeUndefined()
        expect(ctx.status).toBe(200)
        expect(ctx.body).toEqual({
          id: `${accountUrl}/outgoing-payments/${outgoingPayment.id}`,
          accountId: accountUrl,
          receivingPayment,
          state: [
            OutgoingPaymentState.Funding,
            OutgoingPaymentState.Sending
          ].includes(state)
            ? 'processing'
            : state.toLowerCase()
        })
      })
    })
  })

  describe('create', (): void => {
    let options: Omit<CreateOutgoingPaymentOptions, 'accountId'>

    beforeEach(() => {
      options = {
        receivingPayment
      }
    })

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
        { accountId }
      )
      ctx.request.body = options
      return ctx
    }

    test('returns error on invalid id', async (): Promise<void> => {
      const ctx = setup({})
      ctx.params.accountId = 'not_a_uuid'
      await expect(outgoingPaymentRoutes.create(ctx)).rejects.toMatchObject({
        message: 'invalid account id',
        status: 400
      })
    })

    test('returns 406 on invalid Accept', async (): Promise<void> => {
      const ctx = setup({ headers: { Accept: 'text/plain' } })
      await expect(outgoingPaymentRoutes.create(ctx)).rejects.toMatchObject({
        message: 'must accept json',
        status: 406
      })
    })

    test('returns error on invalid Content-Type', async (): Promise<void> => {
      const ctx = setup({ headers: { 'Content-Type': 'text/plain' } })
      await expect(outgoingPaymentRoutes.create(ctx)).rejects.toMatchObject({
        message: 'must send json body',
        status: 400
      })
    })

    test.each`
      field                 | invalidValue
      ${'receivingAccount'} | ${123}
      ${'sendAmount'}       | ${123}
      ${'receiveAmount'}    | ${123}
      ${'receivingPayment'} | ${123}
      ${'description'}      | ${123}
      ${'externalRef'}      | ${123}
    `(
      'returns error on invalid $field',
      async ({ field, invalidValue }): Promise<void> => {
        const ctx = setup({})
        ctx.request.body[field] = invalidValue
        await expect(outgoingPaymentRoutes.create(ctx)).rejects.toMatchObject({
          message: `invalid ${field}`,
          status: 400
        })
      }
    )

    test.each`
      receivingAccount    | receivingPayment
      ${receivingAccount} | ${receivingPayment}
      ${undefined}        | ${undefined}
    `(
      'returns error on invalid destination',
      async ({ receivingAccount, receivingPayment }): Promise<void> => {
        options = {
          receivingAccount,
          receivingPayment
        }
        const ctx = setup({})
        await expect(outgoingPaymentRoutes.create(ctx)).rejects.toMatchObject({
          message: 'invalid destination',
          status: 400
        })
      }
    )

    test.each`
      receivingAccount    | receivingPayment    | sendAmount   | receiveAmount
      ${receivingAccount} | ${undefined}        | ${undefined} | ${undefined}
      ${receivingAccount} | ${undefined}        | ${123}       | ${123}
      ${undefined}        | ${receivingPayment} | ${123}       | ${undefined}
      ${undefined}        | ${receivingPayment} | ${undefined} | ${123}
    `(
      'returns error on invalid destination',
      async ({
        receivingAccount,
        receivingPayment,
        sendAmount,
        receiveAmount
      }): Promise<void> => {
        options = {
          receivingAccount,
          receivingPayment,
          sendAmount: sendAmount
            ? {
                value: sendAmount,
                assetCode: asset.code,
                assetScale: asset.scale
              }
            : undefined,
          receiveAmount: receiveAmount
            ? {
                value: receiveAmount,
                assetCode: asset.code,
                assetScale: asset.scale
              }
            : undefined
        }
        const ctx = setup({})
        await expect(outgoingPaymentRoutes.create(ctx)).rejects.toMatchObject({
          message: 'invalid amount',
          status: 400
        })
      }
    )

    test('returns error on invalid sendAmount asset', async (): Promise<void> => {
      options = {
        receivingAccount,
        sendAmount: {
          ...sendAmount,
          assetScale: sendAmount.assetScale + 1
        }
      }
      const ctx = setup({})
      await expect(outgoingPaymentRoutes.create(ctx)).rejects.toMatchObject({
        message: 'invalid amount',
        status: 400
      })
    })

    describe('returns the outgoing payment on success', (): void => {
      test.each`
        sendAmount   | receiveAmount | description
        ${'123'}     | ${undefined}  | ${'fixed-send'}
        ${undefined} | ${'56'}       | ${'fixed-receive'}
      `(
        '$description',
        async ({ sendAmount, receiveAmount }): Promise<void> => {
          options = {
            receivingAccount,
            sendAmount: sendAmount
              ? {
                  value: sendAmount,
                  assetCode: asset.code,
                  assetScale: asset.scale
                }
              : undefined,
            receiveAmount: receiveAmount
              ? {
                  value: receiveAmount,
                  assetCode: asset.code,
                  assetScale: asset.scale
                }
              : undefined
          }
          const ctx = setup({})
          await expect(
            outgoingPaymentRoutes.create(ctx)
          ).resolves.toBeUndefined()
          expect(ctx.response.status).toBe(201)
          const outgoingPaymentId = ((ctx.response.body as Record<
            string,
            unknown
          >)['id'] as string)
            .split('/')
            .pop()
          expect(ctx.response.body).toEqual({
            id: `${accountUrl}/outgoing-payments/${outgoingPaymentId}`,
            accountId: accountUrl,
            receivingAccount,
            sendAmount: options.sendAmount,
            receiveAmount: options.receiveAmount,
            state: OutgoingPaymentState.Pending.toLowerCase()
          })
        }
      )

      test('IncomingPayment', async (): Promise<void> => {
        options = {
          receivingPayment,
          description: 'rent',
          externalRef: '202201'
        }
        const ctx = setup({})
        await expect(outgoingPaymentRoutes.create(ctx)).resolves.toBeUndefined()
        expect(ctx.response.status).toBe(201)
        const outgoingPaymentId = ((ctx.response.body as Record<
          string,
          unknown
        >)['id'] as string)
          .split('/')
          .pop()
        expect(ctx.response.body).toEqual({
          id: `${accountUrl}/outgoing-payments/${outgoingPaymentId}`,
          accountId: accountUrl,
          receivingPayment,
          description: options.description,
          externalRef: options.externalRef,
          state: OutgoingPaymentState.Pending.toLowerCase()
        })
      })
    })
  })

  describe('list', (): void => {
    let outgoingPayments: OutgoingPayment[]
    let result: Record<string, unknown>[]

    beforeEach(
      async (): Promise<void> => {
        outgoingPayments = []
        for (let i = 0; i < 3; i++) {
          const op = (await outgoingPaymentService.create({
            accountId,
            receivingAccount: receivingAccount,
            sendAmount,
            description: `p${i}`
          })) as OutgoingPayment
          outgoingPayments.push(op)
        }
        result = [0, 1, 2].map((i) => {
          return {
            id: `${accountUrl}/outgoing-payments/${outgoingPayments[i].id}`,
            accountId: accountUrl,
            receivingAccount,
            sendAmount: {
              ...sendAmount,
              value: sendAmount.value.toString()
            },
            state: 'pending',
            description: outgoingPayments[i].description,
            receivingPayment: undefined,
            receiveAmount: undefined,
            externalRef: undefined
          }
        })
      }
    )
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
        const params = id ? { accountId: id } : { accountId }
        const query = {
          cursor: cursor === null ? outgoingPayments[0].id : cursor
        }
        if (first) query['first'] = first
        if (last) query['last'] = last
        const ctx = setup({ headers, query }, params)
        await expect(outgoingPaymentRoutes.list(ctx)).rejects.toMatchObject({
          status,
          message
        })
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
        const cursor = outgoingPayments[cursorIndex]
          ? outgoingPayments[cursorIndex].id
          : undefined
        const ctx = setup(
          {
            headers: { Accept: 'application/json' },
            query: { first, last, cursor }
          },
          { accountId }
        )
        pagination['startCursor'] = outgoingPayments[startIndex].id
        pagination['endCursor'] = outgoingPayments[endIndex].id
        await expect(outgoingPaymentRoutes.list(ctx)).resolves.toBeUndefined()
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
