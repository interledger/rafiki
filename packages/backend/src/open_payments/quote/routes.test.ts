import assert from 'assert'
import * as httpMocks from 'node-mocks-http'
import Knex from 'knex'
import { WorkerUtils, makeWorkerUtils } from 'graphile-worker'
import { v4 as uuid } from 'uuid'
import { IocContract } from '@adonisjs/fold'

import { createContext } from '../../tests/context'
import { createTestApp, TestContainer } from '../../tests/app'
import { resetGraphileDb } from '../../tests/graphileDb'
import { GraphileProducer } from '../../messaging/graphileProducer'
import { Config, IAppConfig } from '../../config/app'
import { initIocContainer } from '../..'
import { AppServices } from '../../app'
import { truncateTables } from '../../tests/tableManager'
import { QuoteService, CreateQuoteOptions } from './service'
import { Quote } from './model'
import { QuoteRoutes } from './routes'
import { Amount } from '../amount'
import { randomAsset } from '../../tests/asset'
import { createQuote } from '../../tests/quote'
import { AppContext } from '../../app'

describe('Quote Routes', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let workerUtils: WorkerUtils
  let quoteService: QuoteService
  let config: IAppConfig
  let quoteRoutes: QuoteRoutes
  let accountId: string
  let accountUrl: string

  const messageProducer = new GraphileProducer()
  const mockMessageProducer = {
    send: jest.fn()
  }
  const receivingAccount = 'http://wallet2.example/bob'
  const receivingPayment = `${receivingAccount}/incoming-payments/${uuid()}`
  const asset = randomAsset()
  const sendAmount: Amount = {
    value: BigInt(123),
    assetCode: asset.code,
    assetScale: asset.scale
  }

  const createAccountQuote = async (accountId: string): Promise<Quote> => {
    return await createQuote(deps, {
      accountId,
      receivingAccount,
      sendAmount: {
        value: BigInt(56),
        assetCode: asset.code,
        assetScale: asset.scale
      },
      validDestination: false
    })
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
      config = await deps.use('config')
      quoteRoutes = await deps.use('quoteRoutes')
      quoteService = await deps.use('quoteService')
    }
  )

  beforeEach(
    async (): Promise<void> => {
      const accountService = await deps.use('accountService')
      accountId = (
        await accountService.create({
          asset: {
            code: sendAmount.assetCode,
            scale: sendAmount.assetScale
          }
        })
      ).id
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
        { quoteId: 'not_a_uuid' }
      )
      await expect(quoteRoutes.get(ctx)).rejects.toHaveProperty(
        'message',
        'invalid id'
      )
    })

    test('returns 406 for wrong Accept', async (): Promise<void> => {
      const ctx = createContext(
        {
          headers: { Accept: 'test/plain' }
        },
        { quoteId: uuid() }
      )
      await expect(quoteRoutes.get(ctx)).rejects.toHaveProperty('status', 406)
    })

    test('returns 404 for nonexistent quote', async (): Promise<void> => {
      const ctx = createContext(
        {
          headers: { Accept: 'application/json' }
        },
        { quoteId: uuid() }
      )
      await expect(quoteRoutes.get(ctx)).rejects.toHaveProperty('status', 404)
    })

    test('returns 200 with a quote', async (): Promise<void> => {
      const quote = await createAccountQuote(accountId)
      const ctx = createContext(
        {
          headers: { Accept: 'application/json' }
        },
        { quoteId: quote.id }
      )
      await expect(quoteRoutes.get(ctx)).resolves.toBeUndefined()
      expect(ctx.status).toBe(200)
      expect(ctx.response.get('Content-Type')).toBe(
        'application/json; charset=utf-8'
      )

      expect(ctx.body).toEqual({
        id: `${accountUrl}/quotes/${quote.id}`,
        accountId: accountUrl,
        receivingPayment: quote.receivingPayment,
        sendAmount: {
          ...quote.sendAmount,
          value: quote.sendAmount.value.toString()
        },
        receiveAmount: {
          ...quote.receiveAmount,
          value: quote.receiveAmount.value.toString()
        },
        createdAt: quote.createdAt.toISOString(),
        updatedAt: quote.updatedAt.toISOString(),
        expiresAt: quote.expiresAt.toISOString()
      })
    })
  })

  describe('create', (): void => {
    let options: Omit<CreateQuoteOptions & CreateQuoteOptions, 'accountId'>

    beforeEach(() => {
      options = {}
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
      await expect(quoteRoutes.create(ctx)).rejects.toMatchObject({
        message: 'invalid account id',
        status: 400
      })
    })

    test('returns 406 on invalid Accept', async (): Promise<void> => {
      const ctx = setup({ headers: { Accept: 'text/plain' } })
      await expect(quoteRoutes.create(ctx)).rejects.toMatchObject({
        message: 'must accept json',
        status: 406
      })
    })

    test('returns error on invalid Content-Type', async (): Promise<void> => {
      const ctx = setup({ headers: { 'Content-Type': 'text/plain' } })
      await expect(quoteRoutes.create(ctx)).rejects.toMatchObject({
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
    `(
      'returns error on invalid $field',
      async ({ field, invalidValue }): Promise<void> => {
        const ctx = setup({})
        ctx.request.body[field] = invalidValue
        await expect(quoteRoutes.create(ctx)).rejects.toMatchObject({
          message: `invalid ${field}`,
          status: 400
        })
      }
    )

    test.each`
      receivingAccount    | receivingPayment    | sendAmount   | receiveAmount
      ${receivingAccount} | ${undefined}        | ${undefined} | ${undefined}
      ${receivingAccount} | ${undefined}        | ${123}       | ${123}
      ${undefined}        | ${receivingPayment} | ${123}       | ${123}
    `(
      'returns error on invalid amount',
      async ({
        receivingAccount,
        receivingPayment,
        sendAmount,
        receiveAmount
      }): Promise<void> => {
        options = {
          receivingPayment,
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
        await expect(quoteRoutes.create(ctx)).rejects.toMatchObject({
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
      await expect(quoteRoutes.create(ctx)).rejects.toMatchObject({
        message: 'invalid amount',
        status: 400
      })
    })

    test('returns 500 on error', async (): Promise<void> => {
      jest
        .spyOn(quoteService, 'create')
        .mockRejectedValueOnce(new Error('unexpected'))
      const ctx = setup({})
      await expect(quoteRoutes.create(ctx)).rejects.toMatchObject({
        message: 'Error trying to create quote',
        status: 500
      })
    })

    describe('returns the quote on success', (): void => {
      describe.each`
        receivingAccount    | receivingPayment    | description
        ${receivingAccount} | ${undefined}        | ${'receivingAccount'}
        ${undefined}        | ${receivingPayment} | ${'receivingPayment'}
      `('$description', ({ receivingAccount, receivingPayment }): void => {
        test.each`
          sendAmount   | receiveAmount | description
          ${'123'}     | ${undefined}  | ${'sendAmount'}
          ${undefined} | ${'56'}       | ${'receiveAmount'}
        `(
          '$description',
          async ({ sendAmount, receiveAmount }): Promise<void> => {
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
            let quote: Quote | undefined
            const quoteSpy = jest
              .spyOn(quoteService, 'create')
              .mockImplementationOnce(async (opts) => {
                quote = await createQuote(deps, {
                  ...opts,
                  validDestination: false
                })
                return quote
              })
            await expect(quoteRoutes.create(ctx)).resolves.toBeUndefined()
            expect(quoteSpy).toHaveBeenCalledWith({
              accountId,
              receivingAccount,
              receivingPayment,
              sendAmount: options.sendAmount && {
                ...options.sendAmount,
                value: BigInt(options.sendAmount.value)
              },
              receiveAmount: options.receiveAmount && {
                ...options.receiveAmount,
                value: BigInt(options.receiveAmount.value)
              }
            })
            expect(ctx.response.status).toBe(201)
            const quoteId = ((ctx.response.body as Record<string, unknown>)[
              'id'
            ] as string)
              .split('/')
              .pop()
            assert.ok(quote)
            expect(ctx.response.body).toEqual({
              id: `${accountUrl}/quotes/${quoteId}`,
              accountId: accountUrl,
              receivingPayment: quote.receivingPayment,
              sendAmount: {
                ...quote.sendAmount,
                value: quote.sendAmount.value.toString()
              },
              receiveAmount: {
                ...quote.receiveAmount,
                value: quote.receiveAmount.value.toString()
              },
              createdAt: quote.createdAt.toISOString(),
              updatedAt: quote.updatedAt.toISOString(),
              expiresAt: quote.expiresAt.toISOString()
            })
          }
        )

        if (receivingPayment) {
          test('receivingPayment.incomingAmount', async (): Promise<void> => {
            options = {
              receivingPayment
            }
            const ctx = setup({})
            let quote: Quote | undefined
            const quoteSpy = jest
              .spyOn(quoteService, 'create')
              .mockImplementationOnce(async (opts) => {
                quote = await createQuote(deps, {
                  ...opts,
                  validDestination: false
                })
                return quote
              })
            await expect(quoteRoutes.create(ctx)).resolves.toBeUndefined()
            expect(quoteSpy).toHaveBeenCalledWith({
              accountId,
              receivingPayment
            })
            expect(ctx.response.status).toBe(201)
            const quoteId = ((ctx.response.body as Record<string, unknown>)[
              'id'
            ] as string)
              .split('/')
              .pop()
            assert.ok(quote)
            expect(ctx.response.body).toEqual({
              id: `${accountUrl}/quotes/${quoteId}`,
              accountId: accountUrl,
              receivingPayment: options.receivingPayment,
              sendAmount: {
                ...quote.sendAmount,
                value: quote.sendAmount.value.toString()
              },
              receiveAmount: {
                ...quote.receiveAmount,
                value: quote.receiveAmount.value.toString()
              },
              createdAt: quote.createdAt.toISOString(),
              updatedAt: quote.updatedAt.toISOString(),
              expiresAt: quote.expiresAt.toISOString()
            })
          })
        }
      })
    })
  })
})
