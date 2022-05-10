import assert from 'assert'
import axios from 'axios'
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
import { createTestApp, TestContainer, testAccessToken } from '../../tests/app'
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

  function mockCreateIncomingPayment(receiveAmount?: Amount): nock.Scope {
    const incomingPaymentsUrl = new URL(`${receivingAccount}/incoming-payments`)
    return nock(incomingPaymentsUrl.origin)
      .post(incomingPaymentsUrl.pathname, function (this: Definition, body) {
        expect(body.incomingAmount).toEqual(
          receiveAmount
            ? {
                value: receiveAmount.value.toString(),
                assetCode: receiveAmount.assetCode,
                assetScale: receiveAmount.assetScale
              }
            : undefined
        )
        return true
      })
      .matchHeader('Accept', 'application/json')
      .matchHeader('Content-Type', 'application/json')
      .reply(201, function (path, requestBody) {
        const headers = this.req.headers
        if (!headers['authorization']) {
          headers.authorization = `GNAP ${testAccessToken}`
        }
        return axios
          .post(`http://localhost:${appContainer.port}${path}`, requestBody, {
            headers
          })
          .then((res) => res.data)
      })
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
    receivingPayment?: string
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
              receivingPayment: expected.receivingPayment || expect.any(String),
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
              updatedAt: expect.any(String),
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

    // receivingAccount is defined in `beforeEach` and unavailable in the `test.each` table
    describe.each`
      toAccount | incomingAmount    | description
      ${true}   | ${undefined}      | ${'receivingAccount'}
      ${false}  | ${undefined}      | ${'receivingPayment'}
      ${false}  | ${incomingAmount} | ${'receivingPayment.incomingAmount'}
    `('$description', ({ toAccount, incomingAmount }): void => {
      describe.each`
        sendAmount    | receiveAmount    | paymentType                      | completeReceivingPayment | description
        ${sendAmount} | ${undefined}     | ${Pay.PaymentType.FixedSend}     | ${toAccount}             | ${'sendAmount'}
        ${undefined}  | ${receiveAmount} | ${Pay.PaymentType.FixedDelivery} | ${false}                 | ${'receiveAmount'}
        ${undefined}  | ${undefined}     | ${Pay.PaymentType.FixedDelivery} | ${false}                 | ${'receivingPayment.incomingAmount'}
      `(
        '$description',
        ({
          sendAmount,
          receiveAmount,
          paymentType,
          completeReceivingPayment
        }): void => {
          let options: CreateQuoteOptions
          let incomingPayment: IncomingPayment
          let receivingPayment: string
          let paymentScope: nock.Scope | undefined
          let expected: ExpectedQuote

          beforeEach(
            async (): Promise<void> => {
              options = {
                accountId,
                sendAmount,
                receiveAmount
              }
              if (toAccount) {
                options.receivingAccount = receivingAccount
                paymentScope = mockCreateIncomingPayment(receiveAmount)
              } else {
                incomingPayment = await createIncomingPayment(deps, {
                  accountId: receivingAccountId,
                  incomingAmount
                })
                options.receivingPayment = `${receivingAccount}/incoming-payments/${incomingPayment.id}`
                paymentScope = undefined
              }
              expected = {
                ...options,
                paymentType
              }
            }
          )

          if (!sendAmount && !receiveAmount && !incomingAmount) {
            it('fails without receivingPayment.incomingAmount', async (): Promise<void> => {
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
                paymentScope?.isDone()
                walletScope.isDone()
                expect(quote).toMatchObject({
                  accountId,
                  receivingPayment: receivingPayment || quote.receivingPayment,
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
                        Number(sendAmount.value) *
                          quote.minExchangeRate.valueOf()
                      )
                    ),
                    assetCode: destinationAsset.code,
                    assetScale: destinationAsset.scale
                  },
                  maxPacketAmount: BigInt('9223372036854775807'),
                  completeReceivingPayment,
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
                it('fails if receiveAmount exceeds receivingPayment.incomingAmount', async (): Promise<void> => {
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
                    completeReceivingPayment,
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
                  await expect(quoteService.get(quote.id)).resolves.toEqual(
                    quote
                  )
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
                paymentScope?.isDone()
                walletScope.isDone()
                delete options.receivingAccount
                expect(quote).toMatchObject({
                  ...options,
                  receiveAmount,
                  maxPacketAmount: BigInt('9223372036854775807'),
                  completeReceivingPayment,
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
                paymentScope?.isDone()
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
                paymentScope?.isDone()
                walletScope.isDone()
                expect(quote).toMatchObject({
                  accountId,
                  receivingPayment:
                    options.receivingPayment || quote.receivingPayment,
                  sendAmount,
                  receiveAmount: receiveAmount || incomingAmount,
                  maxPacketAmount: BigInt('9223372036854775807'),
                  completeReceivingPayment,
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
                paymentScope?.isDone()
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
              paymentScope?.isDone()
              walletScope.isDone()
            })

            if (!toAccount) {
              test.each`
                state                             | error
                ${IncomingPaymentState.Completed} | ${Pay.PaymentError.IncomingPaymentCompleted}
                ${IncomingPaymentState.Expired}   | ${Pay.PaymentError.IncomingPaymentExpired}
              `(
                'throws on $state receivingPayment',
                async ({ state, error }): Promise<void> => {
                  await incomingPayment.$query(knex).patch({ state })
                  await expect(quoteService.create(options)).rejects.toEqual(
                    error
                  )
                }
              )
            }
          }
        }
      )
    })

    it('fails on unknown account', async (): Promise<void> => {
      await expect(
        quoteService.create({
          accountId: uuid(),
          receivingAccount,
          sendAmount
        })
      ).resolves.toEqual(QuoteError.UnknownAccount)
    })

    it('fails on invalid receivingAccount', async (): Promise<void> => {
      await expect(
        quoteService.create({
          accountId,
          receivingAccount: `${config.publicHost}/${uuid()}`,
          sendAmount
        })
      ).resolves.toEqual(QuoteError.InvalidDestination)
    })

    it('fails on invalid receivingPayment', async (): Promise<void> => {
      await expect(
        quoteService.create({
          accountId,
          receivingPayment: `${receivingAccount}/incoming-payments/${uuid()}`,
          sendAmount
        })
      ).resolves.toEqual(QuoteError.InvalidDestination)
    })

    // receivingAccount is defined in `beforeEach` and unavailable in the `test.each` table
    test.each`
      toPayment | toAccount | sendAmount                              | receiveAmount                              | error                            | description
      ${false}  | ${false}  | ${sendAmount}                           | ${undefined}                               | ${QuoteError.InvalidDestination} | ${'without a destination'}
      ${true}   | ${true}   | ${sendAmount}                           | ${undefined}                               | ${QuoteError.InvalidDestination} | ${'with multiple destinations'}
      ${false}  | ${true}   | ${undefined}                            | ${undefined}                               | ${QuoteError.InvalidAmount}      | ${'with missing amount'}
      ${true}   | ${false}  | ${sendAmount}                           | ${receiveAmount}                           | ${QuoteError.InvalidAmount}      | ${'with multiple amounts'}
      ${false}  | ${true}   | ${{ ...sendAmount, value: BigInt(0) }}  | ${undefined}                               | ${QuoteError.InvalidAmount}      | ${'with sendAmount of zero'}
      ${false}  | ${true}   | ${{ ...sendAmount, value: BigInt(-1) }} | ${undefined}                               | ${QuoteError.InvalidAmount}      | ${'with negative sendAmount'}
      ${false}  | ${true}   | ${{ ...sendAmount, assetScale: 3 }}     | ${undefined}                               | ${QuoteError.InvalidAmount}      | ${'with wrong sendAmount asset'}
      ${false}  | ${true}   | ${undefined}                            | ${{ ...receiveAmount, value: BigInt(0) }}  | ${QuoteError.InvalidAmount}      | ${'with receiveAmount of zero'}
      ${false}  | ${true}   | ${undefined}                            | ${{ ...receiveAmount, value: BigInt(-1) }} | ${QuoteError.InvalidAmount}      | ${'with negative receiveAmount'}
      ${false}  | ${true}   | ${undefined}                            | ${{ ...receiveAmount, assetScale: 3 }}     | ${QuoteError.InvalidDestination} | ${'with wrong receiveAmount asset (receivingAccount)'}
      ${true}   | ${false}  | ${undefined}                            | ${{ ...receiveAmount, assetScale: 3 }}     | ${QuoteError.InvalidAmount}      | ${'with wrong receiveAmount asset (receivingPayment)'}
    `(
      'fails to create $description',
      async ({
        toPayment,
        toAccount,
        sendAmount,
        receiveAmount,
        error
      }): Promise<void> => {
        await expect(
          quoteService.create({
            accountId,
            receivingPayment: toPayment
              ? `${receivingAccount}/incoming-payments/${
                  (
                    await createIncomingPayment(deps, {
                      accountId: receivingAccountId
                    })
                  ).id
                }`
              : undefined,
            receivingAccount: toAccount ? receivingAccount : undefined,
            sendAmount,
            receiveAmount
          })
        ).resolves.toEqual(error)
      }
    )

    it('fails on rate service error', async (): Promise<void> => {
      const ratesService = await deps.use('ratesService')
      jest
        .spyOn(ratesService, 'prices')
        .mockImplementation(() => Promise.reject(new Error('fail')))
      const scope = mockCreateIncomingPayment()
      await expect(
        quoteService.create({
          accountId,
          receivingAccount,
          sendAmount
        })
      ).rejects.toThrow('missing prices')
      scope.isDone()
    })
  })

  describe('getAccountPage', (): void => {
    getPageTests({
      createModel: async () =>
        Quote.query(knex).insertAndFetch({
          accountId,
          assetId,
          receivingPayment: `${receivingAccount}/incoming-payments/${uuid()}`,
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
