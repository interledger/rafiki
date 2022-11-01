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
import { AppServices, CreateContext } from '../../app'
import { truncateTables } from '../../tests/tableManager'
import { QuoteService } from './service'
import { Quote } from './model'
import { QuoteRoutes, CreateBody } from './routes'
import { Amount, serializeAmount } from '../amount'
import { AccessAction, AccessType, Grant } from '../auth/grant'
import { PaymentPointer } from '../payment_pointer/model'
import { getRouteTests } from '../payment_pointer/model.test'
import { randomAsset } from '../../tests/asset'
import { createGrant } from '../../tests/grant'
import { createPaymentPointer } from '../../tests/paymentPointer'
import { createQuote } from '../../tests/quote'

describe('Quote Routes', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let quoteService: QuoteService
  let config: IAppConfig
  let quoteRoutes: QuoteRoutes
  let paymentPointer: PaymentPointer

  const receiver = `https://wallet2.example/bob/incoming-payments/${uuid()}`
  const asset = randomAsset()
  const sendAmount: Amount = {
    value: BigInt(123),
    assetCode: asset.code,
    assetScale: asset.scale
  }

  const createPaymentPointerQuote = async ({
    paymentPointerId,
    grantId
  }: {
    paymentPointerId: string
    grantId: string
  }): Promise<Quote> => {
    return await createQuote(deps, {
      paymentPointerId,
      receiver,
      sendAmount: {
        value: BigInt(56),
        assetCode: asset.code,
        assetScale: asset.scale
      },
      grantId,
      validDestination: false
    })
  }

  beforeAll(async (): Promise<void> => {
    config = Config
    deps = await initIocContainer(config)
    appContainer = await createTestApp(deps)
    knex = await deps.use('knex')
    config = await deps.use('config')
    quoteRoutes = await deps.use('quoteRoutes')
    quoteService = await deps.use('quoteService')
    jestOpenAPI(await deps.use('openApi'))
  })

  beforeEach(async (): Promise<void> => {
    paymentPointer = await createPaymentPointer(deps, {
      asset: {
        code: sendAmount.assetCode,
        scale: sendAmount.assetScale
      }
    })
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('get', (): void => {
    getRouteTests({
      createGrant: async (options) => createGrant(deps, options),
      getPaymentPointer: async () => paymentPointer,
      createModel: async ({ grant }) =>
        createPaymentPointerQuote({
          paymentPointerId: paymentPointer.id,
          grantId: grant?.grant
        }),
      get: (ctx) => quoteRoutes.get(ctx),
      getBody: (quote) => ({
        id: `${paymentPointer.url}/quotes/${quote.id}`,
        paymentPointer: paymentPointer.url,
        receiver: quote.receiver,
        sendAmount: serializeAmount(quote.sendAmount),
        receiveAmount: serializeAmount(quote.receiveAmount),
        createdAt: quote.createdAt.toISOString(),
        expiresAt: quote.expiresAt.toISOString()
      }),
      urlPath: Quote.urlPath
    })
  })

  describe('create', (): void => {
    let options: CreateBody
    let grant: Grant | undefined

    function setup(
      reqOpts: Pick<httpMocks.RequestOptions, 'headers'>
    ): CreateContext<CreateBody> {
      const ctx = createContext<CreateContext<CreateBody>>({
        headers: Object.assign(
          { Accept: 'application/json', 'Content-Type': 'application/json' },
          reqOpts.headers
        ),
        method: 'POST',
        url: `/quotes`
      })
      ctx.paymentPointer = paymentPointer
      ctx.request.body = {
        ...options
      }
      ctx.grant = grant
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

    describe.each`
      withGrant | description
      ${true}   | ${'grant'}
      ${false}  | ${'no grant'}
    `('returns the quote on success ($description)', ({ withGrant }): void => {
      beforeEach(async (): Promise<void> => {
        grant = withGrant
          ? await createGrant(deps, {
              access: [
                {
                  type: AccessType.Quote,
                  actions: [AccessAction.Create, AccessAction.Read]
                }
              ]
            })
          : undefined
      })

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
                validDestination: false,
                grantId: grant?.grant
              })
              return quote
            })
          await expect(quoteRoutes.create(ctx)).resolves.toBeUndefined()
          expect(quoteSpy).toHaveBeenCalledWith({
            paymentPointerId: paymentPointer.id,
            receiver,
            sendAmount: options.sendAmount && {
              ...options.sendAmount,
              value: BigInt(options.sendAmount.value)
            },
            receiveAmount: options.receiveAmount && {
              ...options.receiveAmount,
              value: BigInt(options.receiveAmount.value)
            },
            grantId: grant?.grant
          })
          expect(ctx.response).toSatisfyApiSpec()
          const quoteId = (
            (ctx.response.body as Record<string, unknown>)['id'] as string
          )
            .split('/')
            .pop()
          assert.ok(quote)
          expect(ctx.response.body).toEqual({
            id: `${paymentPointer.url}/quotes/${quoteId}`,
            paymentPointer: paymentPointer.url,
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
              validDestination: false,
              grantId: grant?.grant
            })
            return quote
          })
        await expect(quoteRoutes.create(ctx)).resolves.toBeUndefined()
        expect(quoteSpy).toHaveBeenCalledWith({
          paymentPointerId: paymentPointer.id,
          receiver,
          grantId: grant?.grant
        })
        expect(ctx.response).toSatisfyApiSpec()
        const quoteId = (
          (ctx.response.body as Record<string, unknown>)['id'] as string
        )
          .split('/')
          .pop()
        assert.ok(quote)
        expect(ctx.response.body).toEqual({
          id: `${paymentPointer.url}/quotes/${quoteId}`,
          paymentPointer: paymentPointer.url,
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
})
