import assert from 'assert'
import nock, { Definition } from 'nock'
import Knex from 'knex'
import * as Pay from '@interledger/pay'
import { URL } from 'url'
import { v4 as uuid } from 'uuid'

import { QuoteError, isQuoteError } from './errors'
import { Quote } from './model'
import {
  QuoteService,
  CreateQuoteOptions,
  generateQuoteSignature
} from './service'
import { createTestApp, TestContainer } from '../../tests/app'
import { IAppConfig, Config } from '../../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../'
import { AppServices } from '../../app'
import { createIncomingPayment } from '../../tests/incomingPayment'
import { truncateTables } from '../../tests/tableManager'
import { AssetOptions } from '../../asset/service'
import { Amount } from '../amount'
import {
  IncomingPayment,
  IncomingPaymentState
} from '../payment/incoming/model'
import { Pagination } from '../../shared/baseModel'
import { getPageTests } from '../../shared/baseModel.test'

describe('QuoteService', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let quoteService: QuoteService
  let knex: Knex
  let accountId: string
  let assetId: string
  let receivingAccount: string
  let receivingAccountId: string
  let config: IAppConfig
  let quoteUrl: URL
  const SIGNATURE_SECRET = 'test secret'

  const asset: AssetOptions = {
    scale: 9,
    code: 'USD'
  }

  const sendAmount = {
    value: BigInt(123),
    assetCode: asset.code,
    assetScale: asset.scale
  }

  const destinationAsset = {
    scale: 9,
    code: 'XRP'
  }

  const receiveAmount = {
    value: BigInt(56),
    assetCode: destinationAsset.code,
    assetScale: destinationAsset.scale
  }

  beforeAll(
    async (): Promise<void> => {
      Config.pricesUrl = 'https://test.prices'
      Config.signatureSecret = SIGNATURE_SECRET
      nock(Config.pricesUrl)
        .get('/')
        .reply(200, () => ({
          USD: 1.0, // base
          XRP: 2.0
        }))
        .persist()
      deps = await initIocContainer(Config)
      appContainer = await createTestApp(deps)

      knex = await deps.use('knex')
      config = await deps.use('config')
      quoteUrl = new URL(Config.quoteUrl)
    }
  )

  beforeEach(
    async (): Promise<void> => {
      quoteService = await deps.use('quoteService')
      const accountService = await deps.use('accountService')
      const account = await accountService.create({
        asset: {
          code: sendAmount.assetCode,
          scale: sendAmount.assetScale
        }
      })
      accountId = account.id
      assetId = account.assetId
      const destinationAccount = await accountService.create({
        asset: destinationAsset
      })
      receivingAccountId = destinationAccount.id
      const accountingService = await deps.use('accountingService')
      await expect(
        accountingService.createDeposit({
          id: uuid(),
          account: destinationAccount.asset,
          amount: BigInt(123)
        })
      ).resolves.toBeUndefined()
      receivingAccount = `${config.publicHost}/${destinationAccount.id}`
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
      await appContainer.shutdown()
    }
  )

  describe('get', (): void => {
    it('returns undefined when no quote exists', async () => {
      await expect(quoteService.get(uuid())).resolves.toBeUndefined()
    })
  })

  interface ExpectedQuote {
    receiver?: string
    sendAmount?: Amount
    receiveAmount?: Amount
    paymentType: Pay.PaymentType
  }

  describe('create', (): void => {
    function mockWalletQuote({
      expected,
      sendAmount,
      receiveAmount,
      status = 201
    }: {
      expected: ExpectedQuote
      sendAmount?: Amount
      receiveAmount?: Amount
      status?: number
    }): nock.Scope {
      return nock(quoteUrl.origin)
        .matchHeader('Accept', 'application/json')
        .matchHeader('Content-Type', 'application/json')
        .post(quoteUrl.pathname, function (this: Definition, body) {
          assert.ok(this.headers)
          const signature = this.headers['rafiki-signature']
          expect(
            generateQuoteSignature(
              body,
              SIGNATURE_SECRET,
              Config.signatureVersion
            )
          ).toEqual(signature)
          try {
            expect(body).toEqual({
              id: expect.any(String),
              accountId,
              receiver: expected.receiver || expect.any(String),
              sendAmount: {
                value:
                  expected.sendAmount?.value.toString() || expect.any(String),
                assetCode: asset.code,
                assetScale: asset.scale
              },
              receiveAmount: {
                value:
                  expected.receiveAmount?.value.toString() ||
                  expect.any(String),
                assetCode: destinationAsset.code,
                assetScale: destinationAsset.scale
              },
              paymentType: expected.paymentType,
              createdAt: expect.any(String),
              expiresAt: expect.any(String)
            })
          } catch (err) {
            return false
          }
          return true
        })
        .reply(
          status,
          function (_path: string, requestBody: Record<string, unknown>) {
            if (sendAmount) {
              requestBody.sendAmount = {
                ...sendAmount,
                value: sendAmount.value.toString()
              }
            }
            if (receiveAmount) {
              requestBody.receiveAmount = {
                ...receiveAmount,
                value: receiveAmount.value.toString()
              }
            }
            return requestBody
          }
        )
    }

    const incomingAmount = {
      ...receiveAmount,
      value: BigInt(1000)
    }

    describe.each`
      incomingAmount    | description
      ${undefined}      | ${'receiver'}
      ${incomingAmount} | ${'receiver.incomingAmount'}
    `('$description', ({ toAccount, incomingAmount }): void => {
      describe.each`
        sendAmount    | receiveAmount    | paymentType                      | description
        ${sendAmount} | ${undefined}     | ${Pay.PaymentType.FixedSend}     | ${'sendAmount'}
        ${undefined}  | ${receiveAmount} | ${Pay.PaymentType.FixedDelivery} | ${'receiveAmount'}
        ${undefined}  | ${undefined}     | ${Pay.PaymentType.FixedDelivery} | ${'receiver.incomingAmount'}
      `('$description', ({ sendAmount, receiveAmount, paymentType }): void => {
        let options: CreateQuoteOptions
        let incomingPayment: IncomingPayment
        let receiver: string
        let expected: ExpectedQuote

        beforeEach(
          async (): Promise<void> => {
            incomingPayment = await createIncomingPayment(deps, {
              accountId: receivingAccountId,
              incomingAmount
            })
            options = {
              accountId,
              receiver: `${receivingAccount}/incoming-payments/${incomingPayment.id}`,
              sendAmount,
              receiveAmount
            }
            expected = {
              ...options,
              paymentType
            }
          }
        )

        if (!sendAmount && !receiveAmount && !incomingAmount) {
          it('fails without receiver.incomingAmount', async (): Promise<void> => {
            await expect(quoteService.create(options)).resolves.toEqual(
              toAccount
                ? QuoteError.InvalidAmount
                : QuoteError.InvalidDestination
            )
          })
        } else {
          if (sendAmount || receiveAmount) {
            it('creates a Quote', async () => {
              const walletScope = mockWalletQuote({
                expected
              })
              const quote = await quoteService.create(options)
              assert.ok(!isQuoteError(quote))
              walletScope.isDone()
              expect(quote).toMatchObject({
                accountId,
                receiver: receiver || quote.receiver,
                sendAmount: sendAmount || {
                  value: BigInt(
                    Math.ceil(
                      Number(receiveAmount.value) /
                        quote.minExchangeRate.valueOf()
                    )
                  ),
                  assetCode: asset.code,
                  assetScale: asset.scale
                },
                receiveAmount: receiveAmount || {
                  value: BigInt(
                    Math.ceil(
                      Number(sendAmount.value) * quote.minExchangeRate.valueOf()
                    )
                  ),
                  assetCode: destinationAsset.code,
                  assetScale: destinationAsset.scale
                },
                maxPacketAmount: BigInt('9223372036854775807'),
                createdAt: expect.any(Date),
                updatedAt: expect.any(Date),
                expiresAt: new Date(
                  quote.createdAt.getTime() + config.quoteLifespan
                )
              })
              expect(quote.minExchangeRate.valueOf()).toBe(
                0.5 * (1 - config.slippage)
              )
              expect(quote.lowEstimatedExchangeRate.valueOf()).toBe(0.5)
              expect(quote.highEstimatedExchangeRate.valueOf()).toBe(
                0.500000000001
              )

              await expect(quoteService.get(quote.id)).resolves.toEqual(quote)
            })

            if (incomingAmount) {
              it('fails if receiveAmount exceeds receiver.incomingAmount', async (): Promise<void> => {
                await incomingPayment.$query(knex).patch({
                  incomingAmount: {
                    value: BigInt(1),
                    assetCode: destinationAsset.code,
                    assetScale: destinationAsset.scale
                  }
                })
                const scope = sendAmount
                  ? mockWalletQuote({
                      expected
                    })
                  : undefined
                await expect(quoteService.create(options)).resolves.toEqual(
                  QuoteError.InvalidAmount
                )
                scope?.isDone()
              })
            }
          } else {
            if (incomingAmount) {
              it('creates a Quote', async () => {
                const scope = mockWalletQuote({
                  expected
                })
                const quote = await quoteService.create(options)
                scope.isDone()
                assert.ok(!isQuoteError(quote))
                expect(quote).toMatchObject({
                  ...options,
                  maxPacketAmount: BigInt('9223372036854775807'),
                  sendAmount: {
                    value: BigInt(
                      Math.ceil(
                        Number(incomingAmount.value) /
                          quote.minExchangeRate.valueOf()
                      )
                    ),
                    assetCode: asset.code,
                    assetScale: asset.scale
                  },
                  receiveAmount: incomingAmount,
                  createdAt: expect.any(Date),
                  updatedAt: expect.any(Date),
                  expiresAt: new Date(
                    quote.createdAt.getTime() + config.quoteLifespan
                  )
                })
                expect(quote.minExchangeRate.valueOf()).toBe(
                  0.5 * (1 - config.slippage)
                )
                expect(quote.lowEstimatedExchangeRate.valueOf()).toBe(0.5)
                expect(quote.highEstimatedExchangeRate.valueOf()).toBe(
                  0.500000000001
                )
                await expect(quoteService.get(quote.id)).resolves.toEqual(quote)
              })
            }
          }

          if (paymentType === Pay.PaymentType.FixedSend) {
            it('uses wallet adjusted receiveAmount', async () => {
              const receiveAmount = {
                value: sendAmount.value / BigInt(3),
                assetCode: destinationAsset.code,
                assetScale: destinationAsset.scale
              }
              const walletScope = mockWalletQuote({
                expected,
                receiveAmount
              })
              const quote = await quoteService.create(options)
              assert.ok(!isQuoteError(quote))
              walletScope.isDone()
              expect(quote).toMatchObject({
                ...options,
                receiveAmount,
                maxPacketAmount: BigInt('9223372036854775807'),
                createdAt: expect.any(Date),
                updatedAt: expect.any(Date),
                expiresAt: new Date(
                  quote.createdAt.getTime() + config.quoteLifespan
                )
              })
              expect(quote.minExchangeRate.valueOf()).toBe(
                0.5 * (1 - config.slippage)
              )
              expect(quote.lowEstimatedExchangeRate.valueOf()).toBe(0.5)
              expect(quote.highEstimatedExchangeRate.valueOf()).toBe(
                0.500000000001
              )

              await expect(quoteService.get(quote.id)).resolves.toEqual(quote)
            })

            it('fails if wallet increases receiveAmount', async (): Promise<void> => {
              const walletScope = mockWalletQuote({
                expected,
                receiveAmount: {
                  value: BigInt(100),
                  assetCode: destinationAsset.code,
                  assetScale: destinationAsset.scale
                }
              })
              await expect(quoteService.create(options)).resolves.toEqual(
                QuoteError.InvalidAmount
              )
              walletScope.isDone()
            })
          } else if (receiveAmount || incomingAmount) {
            it('uses wallet adjusted sendAmount', async () => {
              const sendAmount = {
                value:
                  BigInt(3) * (receiveAmount?.value || incomingAmount.value),
                assetCode: asset.code,
                assetScale: asset.scale
              }
              const walletScope = mockWalletQuote({
                expected,
                sendAmount
              })
              const quote = await quoteService.create(options)
              assert.ok(!isQuoteError(quote))
              walletScope.isDone()
              expect(quote).toMatchObject({
                accountId,
                receiver: options.receiver,
                sendAmount,
                receiveAmount: receiveAmount || incomingAmount,
                maxPacketAmount: BigInt('9223372036854775807'),
                createdAt: expect.any(Date),
                updatedAt: expect.any(Date),
                expiresAt: new Date(
                  quote.createdAt.getTime() + config.quoteLifespan
                )
              })
              expect(quote.minExchangeRate.valueOf()).toBe(
                0.5 * (1 - config.slippage)
              )
              expect(quote.lowEstimatedExchangeRate.valueOf()).toBe(0.5)
              expect(quote.highEstimatedExchangeRate.valueOf()).toBe(
                0.500000000001
              )

              await expect(quoteService.get(quote.id)).resolves.toEqual(quote)
            })

            it('fails if wallet decreases sendAmount', async (): Promise<void> => {
              const walletScope = mockWalletQuote({
                expected,
                sendAmount: {
                  value: BigInt(100),
                  assetCode: destinationAsset.code,
                  assetScale: destinationAsset.scale
                }
              })
              await expect(quoteService.create(options)).resolves.toEqual(
                QuoteError.InvalidAmount
              )
              walletScope.isDone()
            })
          }

          it('fails if wallet does not respond 201', async (): Promise<void> => {
            const walletScope = mockWalletQuote({
              expected,
              status: 403
            })
            await expect(quoteService.create(options)).rejects.toThrowError(
              'Request failed with status code 403'
            )
            walletScope.isDone()
          })

          if (!toAccount) {
            test.each`
              state                             | error
              ${IncomingPaymentState.Completed} | ${Pay.PaymentError.IncomingPaymentCompleted}
              ${IncomingPaymentState.Expired}   | ${Pay.PaymentError.IncomingPaymentExpired}
            `(
              'throws on $state receiver',
              async ({ state, error }): Promise<void> => {
                await incomingPayment.$query(knex).patch({
                  state,
                  expiresAt:
                    state === IncomingPaymentState.Expired
                      ? new Date()
                      : undefined
                })
                await expect(quoteService.create(options)).rejects.toEqual(
                  error
                )
              }
            )
          }
        }
      })
    })

    it('fails on unknown account', async (): Promise<void> => {
      await expect(
        quoteService.create({
          accountId: uuid(),
          receiver: `${receivingAccount}/incoming-payments/${uuid()}`,
          sendAmount
        })
      ).resolves.toEqual(QuoteError.UnknownAccount)
    })

    it('fails on invalid receiver', async (): Promise<void> => {
      await expect(
        quoteService.create({
          accountId,
          receiver: `${receivingAccount}/incoming-payments/${uuid()}`,
          sendAmount
        })
      ).resolves.toEqual(QuoteError.InvalidDestination)
    })

    test.each`
      sendAmount                              | receiveAmount                              | description
      ${sendAmount}                           | ${receiveAmount}                           | ${'with multiple amounts'}
      ${{ ...sendAmount, value: BigInt(0) }}  | ${undefined}                               | ${'with sendAmount of zero'}
      ${{ ...sendAmount, value: BigInt(-1) }} | ${undefined}                               | ${'with negative sendAmount'}
      ${{ ...sendAmount, assetScale: 3 }}     | ${undefined}                               | ${'with wrong sendAmount asset'}
      ${undefined}                            | ${{ ...receiveAmount, value: BigInt(0) }}  | ${'with receiveAmount of zero'}
      ${undefined}                            | ${{ ...receiveAmount, value: BigInt(-1) }} | ${'with negative receiveAmount'}
      ${undefined}                            | ${{ ...receiveAmount, assetScale: 3 }}     | ${'with wrong receiveAmount asset'}
    `(
      'fails to create $description',
      async ({ sendAmount, receiveAmount }): Promise<void> => {
        await expect(
          quoteService.create({
            accountId,
            receiver: `${receivingAccount}/incoming-payments/${
              (
                await createIncomingPayment(deps, {
                  accountId: receivingAccountId
                })
              ).id
            }`,
            sendAmount,
            receiveAmount
          })
        ).resolves.toEqual(QuoteError.InvalidAmount)
      }
    )

    it('fails on rate service error', async (): Promise<void> => {
      const ratesService = await deps.use('ratesService')
      jest
        .spyOn(ratesService, 'prices')
        .mockImplementation(() => Promise.reject(new Error('fail')))
      await expect(
        quoteService.create({
          accountId,
          receiver: `${receivingAccount}/incoming-payments/${
            (
              await createIncomingPayment(deps, {
                accountId: receivingAccountId
              })
            ).id
          }`,
          sendAmount
        })
      ).rejects.toThrow('missing prices')
    })
  })

  describe('getAccountPage', (): void => {
    getPageTests({
      createModel: async () =>
        Quote.query(knex).insertAndFetch({
          accountId,
          assetId,
          receiver: `${receivingAccount}/incoming-payments/${uuid()}`,
          sendAmount,
          receiveAmount,
          maxPacketAmount: BigInt('9223372036854775807'),
          lowEstimatedExchangeRate: Pay.Ratio.of(
            Pay.Int.from(500000000000n) as Pay.PositiveInt,
            Pay.Int.from(1000000000000n) as Pay.PositiveInt
          ),
          highEstimatedExchangeRate: Pay.Ratio.of(
            Pay.Int.from(500000000001n) as Pay.PositiveInt,
            Pay.Int.from(1000000000000n) as Pay.PositiveInt
          ),
          minExchangeRate: Pay.Ratio.of(
            Pay.Int.from(495n) as Pay.PositiveInt,
            Pay.Int.from(1000n) as Pay.PositiveInt
          ),
          expiresAt: new Date(Date.now() + config.quoteLifespan)
        }),
      getPage: (pagination: Pagination) =>
        quoteService.getAccountPage(accountId, pagination)
    })
  })
})
