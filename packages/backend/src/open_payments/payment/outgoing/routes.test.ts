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
import { PaymentState } from './model'
import { OutgoingPaymentRoutes } from './routes'
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

  const messageProducer = new GraphileProducer()
  const mockMessageProducer = {
    send: jest.fn()
  }
  const receivingAccount = `https://wallet.example/pay/${uuid()}`
  const receivingPayment = `http://wallet2.example/incoming/${uuid()}`
  const asset = randomAsset()
  const sendAmount = {
    amount: BigInt(123),
    assetCode: asset.code,
    assetScale: asset.scale
  }
  const receiveAmount = {
    amount: BigInt(56),
    assetCode: asset.code,
    assetScale: asset.scale
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
      sendAmount     | receiveAmount | description
      ${BigInt(123)} | ${undefined}  | ${'fixed-send'}
      ${undefined}   | ${BigInt(56)} | ${'fixed-receive'}
    `(
      'returns 200 with a $description open payments outgoing payment',
      async ({ sendAmount, receiveAmount }): Promise<void> => {
        const outgoingPayment = await outgoingPaymentService.create({
          accountId,
          receivingAccount,
          sendAmount: sendAmount && { amount: sendAmount },
          receiveAmount: receiveAmount && { amount: receiveAmount }
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
          id: `https://wallet.example/outgoing-payments/${outgoingPayment.id}`,
          account: `https://wallet.example/pay/${accountId}`,
          receivingAccount,
          sendAmount: sendAmount && {
            amount: sendAmount.toString(),
            assetCode: asset.code,
            assetScale: asset.scale
          },
          receiveAmount: receiveAmount && { amount: receiveAmount.toString() },
          state: PaymentState.Pending.toLowerCase(),
          authorized: false
        })
      }
    )

    test('returns 200 with a quoted outgoing payment to an incoming payment', async (): Promise<void> => {
      const outgoingPayment = await outgoingPaymentService.create({
        accountId,
        receivingPayment,
        authorized: true,
        description: 'rent',
        externalRef: '202201'
      })
      assert.ok(!isOutgoingPaymentError(outgoingPayment))
      await outgoingPayment.$query(knex).patch({
        state: PaymentState.Funding,
        sendAmount,
        receiveAmount,
        expiresAt: new Date(Date.now() + 1000),
        quote: {
          timestamp: new Date(),
          targetType: Pay.PaymentType.FixedSend,
          maxPacketAmount: BigInt(789),
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          minExchangeRate: Pay.Ratio.from(1.23)!,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          lowExchangeRateEstimate: Pay.Ratio.from(1.2)!,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          highExchangeRateEstimate: Pay.Ratio.from(2.3)!,
          amountSent: BigInt(0)
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

      assert.ok(outgoingPayment.expiresAt)
      expect(ctx.body).toEqual({
        id: `https://wallet.example/outgoing-payments/${outgoingPayment.id}`,
        account: `https://wallet.example/pay/${accountId}`,
        receivingPayment,
        sendAmount: {
          ...sendAmount,
          amount: sendAmount.amount.toString()
        },
        receiveAmount: {
          ...receiveAmount,
          amount: receiveAmount.amount.toString()
        },
        state: 'processing',
        authorized: outgoingPayment.authorized,
        description: outgoingPayment.description,
        externalRef: outgoingPayment.externalRef,
        expiresAt: outgoingPayment.expiresAt.toISOString()
      })
    })

    Object.values(PaymentState).forEach((state) => {
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
          id: `https://wallet.example/outgoing-payments/${outgoingPayment.id}`,
          account: `https://wallet.example/pay/${accountId}`,
          receivingPayment,
          state: [PaymentState.Funding, PaymentState.Sending].includes(state)
            ? 'processing'
            : state.toLowerCase(),
          authorized: false
        })
      })
    })
  })

  describe('create', (): void => {
    let options: Omit<
      CreateOutgoingPaymentOptions,
      'accountId' | 'authorized'
    > & {
      authorized?: string
    }

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
      ${'authorized'}       | ${123}
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
          sendAmount: sendAmount ? { amount: sendAmount } : undefined,
          receiveAmount: receiveAmount ? { amount: receiveAmount } : undefined
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
      describe.each`
        sendAmount   | receiveAmount | description
        ${'123'}     | ${undefined}  | ${'fixed-send'}
        ${undefined} | ${'56'}       | ${'fixed-receive'}
      `('$description', ({ sendAmount, receiveAmount }): void => {
        test.each`
          amountAsset
          ${true}
          ${false}
        `(
          'specify amount asset: $amountAsset',
          async ({ amountAsset }): Promise<void> => {
            options = {
              receivingAccount,
              sendAmount: sendAmount
                ? {
                    amount: sendAmount
                  }
                : undefined,
              receiveAmount: receiveAmount
                ? {
                    amount: receiveAmount
                  }
                : undefined
            }
            if (amountAsset) {
              if (options.sendAmount) {
                ;(options.sendAmount.assetCode = asset.code),
                  (options.sendAmount.assetScale = asset.scale)
              } else if (options.receiveAmount) {
                ;(options.receiveAmount.assetCode = asset.code),
                  (options.receiveAmount.assetScale = asset.scale)
              }
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
              id: `${config.publicHost}/outgoing-payments/${outgoingPaymentId}`,
              account: `${config.publicHost}/pay/${accountId}`,
              receivingAccount,
              sendAmount: sendAmount && {
                amount: sendAmount,
                assetCode: asset.code,
                assetScale: asset.scale
              },
              receiveAmount: options.receiveAmount,
              authorized: false,
              state: PaymentState.Pending.toLowerCase()
            })
          }
        )
      })

      test('IncomingPayment', async (): Promise<void> => {
        options = {
          receivingPayment,
          authorized: 'true',
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
          id: `${config.publicHost}/outgoing-payments/${outgoingPaymentId}`,
          account: `${config.publicHost}/pay/${accountId}`,
          receivingPayment,
          authorized: true,
          description: options.description,
          externalRef: options.externalRef,
          state: PaymentState.Pending.toLowerCase()
        })
      })
    })
  })

  describe('update', (): void => {
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
        { outgoingPaymentId: uuid() }
      )
      ctx.request.body = {}
      return ctx
    }

    test('returns error on invalid id', async (): Promise<void> => {
      const ctx = setup({})
      ctx.params.outgoingPaymentId = 'not_a_uuid'
      await expect(outgoingPaymentRoutes.update(ctx)).rejects.toMatchObject({
        message: 'invalid outgoing payment id',
        status: 400
      })
    })

    test('returns error on unknown outgoing payment', async (): Promise<void> => {
      const ctx = setup({})
      ctx.request.body['authorized'] = 'true'
      await expect(outgoingPaymentRoutes.update(ctx)).rejects.toMatchObject({
        message: 'unknown payment',
        status: 404
      })
    })

    test('returns 406 on invalid Accept', async (): Promise<void> => {
      const ctx = setup({ headers: { Accept: 'text/plain' } })
      await expect(outgoingPaymentRoutes.update(ctx)).rejects.toMatchObject({
        message: 'must accept json',
        status: 406
      })
    })

    test('returns error on invalid Content-Type', async (): Promise<void> => {
      const ctx = setup({ headers: { 'Content-Type': 'text/plain' } })
      await expect(outgoingPaymentRoutes.update(ctx)).rejects.toMatchObject({
        message: 'must send json body',
        status: 400
      })
    })

    test.each`
      field           | invalidValue
      ${'authorized'} | ${123}
      ${'authorized'} | ${'false'}
    `(
      'returns error on invalid $field',
      async ({ field, invalidValue }): Promise<void> => {
        const ctx = setup({})
        ctx.request.body[field] = invalidValue
        await expect(outgoingPaymentRoutes.update(ctx)).rejects.toMatchObject({
          message: `invalid ${field}`,
          status: 400
        })
      }
    )

    test('returns the authorized outgoing payment on success', async (): Promise<void> => {
      const outgoingPayment = await outgoingPaymentService.create({
        accountId,
        receivingPayment
      })
      assert.ok(!isOutgoingPaymentError(outgoingPayment))
      const ctx = setup({})
      ctx.params.outgoingPaymentId = outgoingPayment.id
      ctx.request.body['authorized'] = 'true'
      await expect(outgoingPaymentRoutes.update(ctx)).resolves.toBeUndefined()
      expect(ctx.response.status).toBe(200)
      const outgoingPaymentId = ((ctx.response.body as Record<string, unknown>)[
        'id'
      ] as string)
        .split('/')
        .pop()
      expect(ctx.response.body).toEqual({
        id: `${config.publicHost}/outgoing-payments/${outgoingPaymentId}`,
        account: `${config.publicHost}/pay/${accountId}`,
        receivingPayment,
        authorized: true,
        state: PaymentState.Pending.toLowerCase()
      })
    })

    test.each`
      state                   | authorized   | description
      ${undefined}            | ${true}      | ${'authorized'}
      ${PaymentState.Sending} | ${undefined} | ${'state'}
    `(
      'returns error on conflicting $description',
      async ({ state, authorized }): Promise<void> => {
        const outgoingPayment = await outgoingPaymentService.create({
          accountId,
          receivingPayment
        })
        assert.ok(!isOutgoingPaymentError(outgoingPayment))
        await outgoingPayment.$query(knex).patch({
          authorized,
          state
        })
        const ctx = setup({})
        ctx.params.outgoingPaymentId = outgoingPayment.id
        ctx.request.body['authorized'] = 'true'
        await expect(outgoingPaymentRoutes.update(ctx)).rejects.toMatchObject({
          message: 'wrong state',
          status: 409
        })
      }
    )
  })
})
