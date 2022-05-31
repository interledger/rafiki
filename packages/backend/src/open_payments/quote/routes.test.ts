import assert from 'assert'
import jestOpenAPI from 'jest-openapi'
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
import { AppServices, CreateContext, ReadContext, ListContext } from '../../app'
import { truncateTables } from '../../tests/tableManager'
import { QuoteService } from './service'
import { Quote, QuoteJSON } from './model'
import { QuoteRoutes, CreateBody } from './routes'
import { Amount } from '../amount'
import { randomAsset } from '../../tests/asset'
import { createQuote } from '../../tests/quote'

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
      jestOpenAPI(await deps.use('openApi'))
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
    test('returns 404 for nonexistent quote', async (): Promise<void> => {
      const ctx = createContext<ReadContext>(
        {
          headers: { Accept: 'application/json' }
        },
        {
          id: uuid(),
          accountId
        }
      )
      await expect(quoteRoutes.get(ctx)).rejects.toHaveProperty('status', 404)
    })

    test('returns 200 with a quote', async (): Promise<void> => {
      const quote = await createAccountQuote(accountId)
      const ctx = createContext<ReadContext>(
        {
          headers: { Accept: 'application/json' },
          method: 'GET',
          url: `/${accountId}/quotes/${quote.id}`
        },
        {
          id: quote.id,
          accountId
        }
      )
      await expect(quoteRoutes.get(ctx)).resolves.toBeUndefined()
      expect(ctx.response).toSatisfyApiSpec()
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
        expiresAt: quote.expiresAt.toISOString()
      })
    })
  })

  describe('create', (): void => {
    let options: CreateBody

    beforeEach(() => {
      options = {}
    })

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
          url: `/${accountId}/quotes`
        },
        { accountId }
      )
      ctx.request.body = {
        ...options
      }
      return ctx
    }

    test('returns error on invalid sendAmount asset', async (): Promise<void> => {
      options = {
        receivingAccount,
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
            expect(ctx.response).toSatisfyApiSpec()
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
            expect(ctx.response).toSatisfyApiSpec()
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
              expiresAt: quote.expiresAt.toISOString()
            })
          })
        }
      })
    })
  })

  describe('list', (): void => {
    let items: Quote[]
    let result: QuoteJSON[]
    beforeEach(
      async (): Promise<void> => {
        items = []
        for (let i = 0; i < 3; i++) {
          const ip = await createAccountQuote(accountId)
          items.push(ip)
        }
        result = [0, 1, 2].map((i) => {
          return {
            id: `${accountUrl}/quotes/${items[i].id}`,
            accountId: accountUrl,
            receivingPayment: items[i]['receivingPayment'],
            sendAmount: {
              ...items[i]['sendAmount'],
              value: items[i]['sendAmount'].value.toString()
            },
            receiveAmount: {
              ...items[i]['receiveAmount'],
              value: items[i]['receiveAmount'].value.toString()
            },
            expiresAt: items[i].expiresAt.toISOString(),
            createdAt: items[i].createdAt.toISOString()
          }
        })
      }
    )
    test.each`
      first   | last    | cursorIndex | pagination                                                  | startIndex | endIndex | description
      ${null} | ${null} | ${-1}       | ${{ first: 3, hasPreviousPage: false, hasNextPage: false }} | ${0}       | ${2}     | ${'no pagination parameters'}
      ${'10'} | ${null} | ${-1}       | ${{ first: 3, hasPreviousPage: false, hasNextPage: false }} | ${0}       | ${2}     | ${'only `first`'}
      ${'10'} | ${null} | ${0}        | ${{ first: 2, hasPreviousPage: true, hasNextPage: false }}  | ${1}       | ${2}     | ${'`first` plus `cursor`'}
      ${null} | ${'10'} | ${2}        | ${{ last: 2, hasPreviousPage: false, hasNextPage: true }}   | ${0}       | ${1}     | ${'`last` plus `cursor`'}
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
        const cursor = items[cursorIndex] ? items[cursorIndex].id : ''
        pagination['startCursor'] = items[startIndex].id
        pagination['endCursor'] = items[endIndex].id
        const ctx = createContext<ListContext>(
          {
            headers: { Accept: 'application/json' },
            method: 'GET',
            url: `/${accountId}/quotes`
          },
          { accountId }
        )
        ctx.request.query = { first, last, cursor }
        await expect(quoteRoutes.list(ctx)).resolves.toBeUndefined()
        expect(ctx.response).toSatisfyApiSpec()
        expect(ctx.body).toEqual({
          pagination,
          result: result.slice(startIndex, endIndex + 1)
        })
      }
    )
  })
})
