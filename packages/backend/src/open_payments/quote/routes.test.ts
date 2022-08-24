import assert from 'assert'
import jestOpenAPI from 'jest-openapi'
import * as httpMocks from 'node-mocks-http'
import { Knex } from 'knex'
import { v4 as uuid } from 'uuid'
import { IocContract } from '@adonisjs/fold'

import { createContext } from '../../tests/context'
import { createTestApp, TestContainer } from '../../tests/app'
import { Config, IAppConfig } from '../../config/app'
import { initIocContainer } from '../..'
import { AppServices, CreateContext, ReadContext, ListContext } from '../../app'
import { truncateTables } from '../../tests/tableManager'
import { QuoteService } from './service'
import { Quote } from './model'
import { QuoteRoutes, CreateBody } from './routes'
import { Amount } from '../amount'
import { randomAsset } from '../../tests/asset'
import { createPaymentPointer } from '../../tests/paymentPointer'
import { createQuote } from '../../tests/quote'
import { listTests } from '../../shared/routes.test'

describe('Quote Routes', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let quoteService: QuoteService
  let config: IAppConfig
  let quoteRoutes: QuoteRoutes
  let paymentPointerId: string
  let paymentPointerUrl: string

  const receiver = `http://wallet2.example/bob/incoming-payments/${uuid()}`
  const asset = randomAsset()
  const sendAmount: Amount = {
    value: BigInt(123),
    assetCode: asset.code,
    assetScale: asset.scale
  }

  const createPaymentPointerQuote = async (
    paymentPointerId: string
  ): Promise<Quote> => {
    return await createQuote(deps, {
      paymentPointerId,
      receiver,
      sendAmount: {
        value: BigInt(56),
        assetCode: asset.code,
        assetScale: asset.scale
      },
      validDestination: false
    })
  }

  beforeAll(async (): Promise<void> => {
    config = Config
    config.openPaymentsHostname = 'https://wallet.example'
    deps = await initIocContainer(config)
    appContainer = await createTestApp(deps)
    knex = await deps.use('knex')
    config = await deps.use('config')
    quoteRoutes = await deps.use('quoteRoutes')
    quoteService = await deps.use('quoteService')
    jestOpenAPI(await deps.use('openApi'))
  })

  beforeEach(async (): Promise<void> => {
    const paymentPointer = await createPaymentPointer(deps, {
      asset: {
        code: sendAmount.assetCode,
        scale: sendAmount.assetScale
      }
    })
    paymentPointerId = paymentPointer.id
    // paymentPointerUrl = paymentPointer.url
    paymentPointerUrl = `${config.openPaymentsHostname}/${paymentPointerId}`
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('get', (): void => {
    test('returns 404 for nonexistent quote', async (): Promise<void> => {
      const ctx = createContext<ReadContext>(
        {
          headers: { Accept: 'application/json' }
        },
        {
          quoteId: uuid(),
          // paymentPointerId
          accountId: paymentPointerId
        }
      )
      await expect(quoteRoutes.get(ctx)).rejects.toHaveProperty('status', 404)
    })

    test('returns 200 with a quote', async (): Promise<void> => {
      const quote = await createPaymentPointerQuote(paymentPointerId)
      const ctx = createContext<ReadContext>(
        {
          headers: { Accept: 'application/json' },
          method: 'GET',
          url: `/${paymentPointerId}/quotes/${quote.id}`
        },
        {
          quoteId: quote.id,
          // paymentPointerId
          accountId: paymentPointerId
        }
      )
      await expect(quoteRoutes.get(ctx)).resolves.toBeUndefined()
      expect(ctx.response).toSatisfyApiSpec()
      expect(ctx.body).toEqual({
        id: `${paymentPointerUrl}/quotes/${quote.id}`,
        // paymentPointer: paymentPointerUrl,
        accountId: paymentPointerUrl,
        receiver: quote.receiver,
        sendAmount: {
          ...quote.sendAmount,
          value: quote.sendAmount.value.toString()
        },
        receiveAmount: {
          ...quote.receiveAmount,
          value: quote.receiveAmount.value.toString()
        },
        createdAt: quote.createdAt.toISOString(),
        expiresAt: quote.expiresAt.toISOString()
      })
    })
  })

  describe('create', (): void => {
    let options: CreateBody

    function setup(
      reqOpts: Pick<httpMocks.RequestOptions, 'headers'>
    ): CreateContext<CreateBody> {
      const ctx = createContext<CreateContext<CreateBody>>(
        {
          headers: Object.assign(
            { Accept: 'application/json', 'Content-Type': 'application/json' },
            reqOpts.headers
          ),
          method: 'POST',
          url: `/${paymentPointerId}/quotes`
        },
        // { paymentPointerId }
        { accountId: paymentPointerId }
      )
      ctx.request.body = {
        ...options
      }
      return ctx
    }

    test('returns error on invalid sendAmount asset', async (): Promise<void> => {
      options = {
        receiver,
        sendAmount: {
          ...sendAmount,
          value: sendAmount.value.toString(),
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
      test.each`
        sendAmount   | receiveAmount | description
        ${'123'}     | ${undefined}  | ${'sendAmount'}
        ${undefined} | ${'56'}       | ${'receiveAmount'}
      `(
        '$description',
        async ({ sendAmount, receiveAmount }): Promise<void> => {
          options = {
            receiver,
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
            paymentPointerId,
            receiver,
            sendAmount: options.sendAmount && {
              ...options.sendAmount,
              value: BigInt(options.sendAmount.value)
            },
            receiveAmount: options.receiveAmount && {
              ...options.receiveAmount,
              value: BigInt(options.receiveAmount.value)
            }
          })
          expect(ctx.response).toSatisfyApiSpec()
          const quoteId = (
            (ctx.response.body as Record<string, unknown>)['id'] as string
          )
            .split('/')
            .pop()
          assert.ok(quote)
          expect(ctx.response.body).toEqual({
            id: `${paymentPointerUrl}/quotes/${quoteId}`,
            // paymentPointer: paymentPointerUrl,
            accountId: paymentPointerUrl,
            receiver: quote.receiver,
            sendAmount: {
              ...quote.sendAmount,
              value: quote.sendAmount.value.toString()
            },
            receiveAmount: {
              ...quote.receiveAmount,
              value: quote.receiveAmount.value.toString()
            },
            createdAt: quote.createdAt.toISOString(),
            expiresAt: quote.expiresAt.toISOString()
          })
        }
      )

      test('receiver.incomingAmount', async (): Promise<void> => {
        options = {
          receiver
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
          paymentPointerId,
          receiver
        })
        expect(ctx.response).toSatisfyApiSpec()
        const quoteId = (
          (ctx.response.body as Record<string, unknown>)['id'] as string
        )
          .split('/')
          .pop()
        assert.ok(quote)
        expect(ctx.response.body).toEqual({
          id: `${paymentPointerUrl}/quotes/${quoteId}`,
          // paymentPointer: paymentPointerUrl,
          accountId: paymentPointerUrl,
          receiver: options.receiver,
          sendAmount: {
            ...quote.sendAmount,
            value: quote.sendAmount.value.toString()
          },
          receiveAmount: {
            ...quote.receiveAmount,
            value: quote.receiveAmount.value.toString()
          },
          createdAt: quote.createdAt.toISOString(),
          expiresAt: quote.expiresAt.toISOString()
        })
      })
    })
  })

  describe('list', (): void => {
    listTests({
      getPaymentPointerId: () => paymentPointerId,
      getUrl: () => `/${paymentPointerId}/quotes`,
      createItem: async (_index) => {
        const quote = await createPaymentPointerQuote(paymentPointerId)
        return {
          id: `${paymentPointerUrl}/quotes/${quote.id}`,
          // paymentPointer: paymentPointerUrl,
          accountId: paymentPointerUrl,
          receiver: quote.receiver,
          sendAmount: {
            ...quote.sendAmount,
            value: quote.sendAmount.value.toString()
          },
          receiveAmount: {
            ...quote.receiveAmount,
            value: quote.receiveAmount.value.toString()
          },
          expiresAt: quote.expiresAt.toISOString(),
          createdAt: quote.createdAt.toISOString()
        }
      },
      list: (ctx: ListContext) => quoteRoutes.list(ctx)
    })
  })
})
