import { gql } from 'apollo-server-koa'
import Knex from 'knex'
import { v4 as uuid } from 'uuid'

import { getPageTests } from './page.test'
import { createTestApp, TestContainer } from '../../tests/app'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { randomAsset } from '../../tests/asset'
import { createQuote } from '../../tests/quote'
import { truncateTables } from '../../tests/tableManager'
import { QuoteError, errorToMessage } from '../../open_payments/quote/errors'
import { QuoteService } from '../../open_payments/quote/service'
import { Quote as QuoteModel } from '../../open_payments/quote/model'
import { AccountService } from '../../open_payments/account/service'
import { Amount } from '../../open_payments/amount'
import { Quote, QuoteResponse } from '../generated/graphql'

describe('Quote Resolvers', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let quoteService: QuoteService
  let accountService: AccountService

  const receivingAccount = 'http://wallet2.example/bob'
  const receiver = `${receivingAccount}/incoming-payments/${uuid()}`
  const asset = randomAsset()

  beforeAll(
    async (): Promise<void> => {
      deps = await initIocContainer(Config)
      appContainer = await createTestApp(deps)
      knex = await deps.use('knex')
      quoteService = await deps.use('quoteService')
      accountService = await deps.use('accountService')
    }
  )

  afterEach(
    async (): Promise<void> => {
      jest.restoreAllMocks()
      await truncateTables(knex)
    }
  )

  afterAll(
    async (): Promise<void> => {
      await appContainer.apolloClient.stop()
      await appContainer.shutdown()
    }
  )

  const createAccountQuote = async (accountId: string): Promise<QuoteModel> => {
    return await createQuote(deps, {
      accountId,
      receiver,
      sendAmount: {
        value: BigInt(56),
        assetCode: asset.code,
        assetScale: asset.scale
      },
      validDestination: false
    })
  }

  describe('Query.quote', (): void => {
    test('200', async (): Promise<void> => {
      const { id: accountId } = await accountService.create({
        asset
      })
      const quote = await createAccountQuote(accountId)

      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query Quote($quoteId: String!) {
              quote(id: $quoteId) {
                id
                accountId
                receiver
                sendAmount {
                  value
                  assetCode
                  assetScale
                }
                receiveAmount {
                  value
                  assetCode
                  assetScale
                }
                maxPacketAmount
                minExchangeRate
                lowEstimatedExchangeRate
                highEstimatedExchangeRate
                createdAt
                expiresAt
              }
            }
          `,
          variables: {
            quoteId: quote.id
          }
        })
        .then((query): Quote => query.data?.quote)

      expect(query).toEqual({
        id: quote.id,
        accountId,
        receiver: quote.receiver,
        sendAmount: {
          value: quote.sendAmount.value.toString(),
          assetCode: quote.sendAmount.assetCode,
          assetScale: quote.sendAmount.assetScale,
          __typename: 'Amount'
        },
        receiveAmount: {
          value: quote.receiveAmount.value.toString(),
          assetCode: quote.receiveAmount.assetCode,
          assetScale: quote.receiveAmount.assetScale,
          __typename: 'Amount'
        },
        maxPacketAmount: quote.maxPacketAmount.toString(),
        minExchangeRate: quote.minExchangeRate.valueOf(),
        lowEstimatedExchangeRate: quote.lowEstimatedExchangeRate.valueOf(),
        highEstimatedExchangeRate: quote.highEstimatedExchangeRate.valueOf(),
        createdAt: quote.createdAt.toISOString(),
        expiresAt: quote.expiresAt.toISOString(),
        __typename: 'Quote'
      })
    })

    test('404', async (): Promise<void> => {
      jest.spyOn(quoteService, 'get').mockImplementation(async () => undefined)

      await expect(
        appContainer.apolloClient.query({
          query: gql`
            query Quote($quoteId: String!) {
              quote(id: $quoteId) {
                id
              }
            }
          `,
          variables: { quoteId: uuid() }
        })
      ).rejects.toThrow('quote does not exist')
    })
  })

  describe('Mutation.createQuote', (): void => {
    const receiveAsset = {
      code: 'XRP',
      scale: 9
    }
    const sendAmount: Amount = {
      value: BigInt(123),
      assetCode: asset.code,
      assetScale: asset.scale
    }
    const receiveAmount: Amount = {
      value: BigInt(56),
      assetCode: receiveAsset.code,
      assetScale: receiveAsset.scale
    }

    const input = {
      accountId: uuid(),
      receiver,
      sendAmount
    }

    test.each`
      sendAmount    | receiveAmount    | type
      ${sendAmount} | ${undefined}     | ${'fixed send to incoming payment'}
      ${undefined}  | ${receiveAmount} | ${'fixed receive to incoming payment'}
      ${undefined}  | ${undefined}     | ${'incoming payment'}
    `(
      '200 ($type)',
      async ({ sendAmount, receiveAmount }): Promise<void> => {
        const { id: accountId } = await accountService.create({
          asset
        })
        const input = {
          accountId,
          sendAmount,
          receiveAmount,
          receiver
        }

        let quote: QuoteModel | undefined
        const createSpy = jest
          .spyOn(quoteService, 'create')
          .mockImplementationOnce(async (opts) => {
            quote = await createQuote(deps, {
              ...opts,
              validDestination: false
            })
            return quote
          })

        const query = await appContainer.apolloClient
          .query({
            query: gql`
              mutation CreateQuote($input: CreateQuoteInput!) {
                createQuote(input: $input) {
                  code
                  success
                  quote {
                    id
                  }
                }
              }
            `,
            variables: { input }
          })
          .then((query): QuoteResponse => query.data?.createQuote)

        expect(createSpy).toHaveBeenCalledWith(input)
        expect(query.code).toBe('200')
        expect(query.success).toBe(true)
        expect(query.quote?.id).toBe(quote?.id)
      }
    )

    test('400', async (): Promise<void> => {
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            mutation CreateQuote($input: CreateQuoteInput!) {
              createQuote(input: $input) {
                code
                success
                message
                quote {
                  id
                }
              }
            }
          `,
          variables: { input }
        })
        .then((query): QuoteResponse => query.data?.createQuote)
      expect(query.code).toBe('404')
      expect(query.success).toBe(false)
      expect(query.message).toBe(errorToMessage[QuoteError.UnknownAccount])
      expect(query.quote).toBeNull()
    })

    test('500', async (): Promise<void> => {
      const createSpy = jest
        .spyOn(quoteService, 'create')
        .mockRejectedValueOnce(new Error('unexpected'))

      const query = await appContainer.apolloClient
        .query({
          query: gql`
            mutation CreateQuote($input: CreateQuoteInput!) {
              createQuote(input: $input) {
                code
                success
                message
                quote {
                  id
                }
              }
            }
          `,
          variables: { input }
        })
        .then((query): QuoteResponse => query.data?.createQuote)
      expect(createSpy).toHaveBeenCalledWith(input)
      expect(query.code).toBe('500')
      expect(query.success).toBe(false)
      expect(query.message).toBe('Error trying to create quote')
      expect(query.quote).toBeNull()
    })
  })

  describe('Account quotes', (): void => {
    let accountId: string

    beforeEach(
      async (): Promise<void> => {
        accountId = (
          await accountService.create({
            asset
          })
        ).id
      }
    )

    getPageTests({
      getClient: () => appContainer.apolloClient,
      createModel: () => createAccountQuote(accountId),
      pagedQuery: 'quotes',
      parent: {
        query: 'account',
        getId: () => accountId
      }
    })
  })
})
