import assert from 'assert'
import { faker } from '@faker-js/faker'
import nock, { Definition } from 'nock'
import { Knex } from 'knex'
import * as Pay from '@interledger/pay'
import { URL } from 'url'
import { v4 as uuid } from 'uuid'

import { QuoteError, isQuoteError } from './errors'
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
import { createAsset } from '../../tests/asset'
import { createIncomingPayment } from '../../tests/incomingPayment'
import {
  createPaymentPointer,
  MockPaymentPointer
} from '../../tests/paymentPointer'
import { createQuote } from '../../tests/quote'
import { truncateTables } from '../../tests/tableManager'
import { AssetOptions } from '../../asset/service'
import { Amount, AmountJSON, serializeAmount } from '../amount'
import {
  IncomingPayment,
  IncomingPaymentState
} from '../payment/incoming/model'
import { getTests } from '../payment_pointer/model.test'

describe('QuoteService', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let quoteService: QuoteService
  let knex: Knex
  let paymentPointerId: string
  let receivingPaymentPointer: MockPaymentPointer
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

  beforeAll(async (): Promise<void> => {
    Config.exchangeRatesUrl = 'https://test.prices'
    Config.signatureSecret = SIGNATURE_SECRET
    nock(Config.exchangeRatesUrl)
      .get('/')
      .reply(200, () => ({
        base: 'USD',
        rates: {
          XRP: 2.0
        }
      }))
      .persist()
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)

    knex = appContainer.knex
    config = await deps.use('config')
    quoteUrl = new URL(Config.quoteUrl)
  })

  beforeEach(async (): Promise<void> => {
    quoteService = await deps.use('quoteService')
    const { id: sendAssetId } = await createAsset(deps, {
      code: sendAmount.assetCode,
      scale: sendAmount.assetScale
    })
    const paymentPointer = await createPaymentPointer(deps, {
      assetId: sendAssetId
    })
    paymentPointerId = paymentPointer.id
    const { id: destinationAssetId } = await createAsset(deps, destinationAsset)
    receivingPaymentPointer = await createPaymentPointer(deps, {
      assetId: destinationAssetId,
      mockServerPort: appContainer.openPaymentsPort
    })
    const accountingService = await deps.use('accountingService')
    await expect(
      accountingService.createDeposit({
        id: uuid(),
        account: receivingPaymentPointer.asset,
        amount: BigInt(123)
      })
    ).resolves.toBeUndefined()
  })

  afterEach(async (): Promise<void> => {
    jest.restoreAllMocks()
    receivingPaymentPointer.scope?.persist(false)
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('get/getPaymentPointerPage', (): void => {
    getTests({
      createModel: ({ client }) =>
        createQuote(deps, {
          paymentPointerId,
          receiver: `${
            receivingPaymentPointer.url
          }/incoming-payments/${uuid()}`,
          sendAmount: {
            value: BigInt(56),
            assetCode: asset.code,
            assetScale: asset.scale
          },
          client,
          validDestination: false
        }),
      get: (options) => quoteService.get(options),
      list: (options) => quoteService.getPaymentPointerPage(options)
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
      sendAmount?: AmountJSON
      receiveAmount?: AmountJSON
      status?: number
    }): nock.Scope {
      return nock(quoteUrl.origin)
        .matchHeader('Accept', 'application/json')
        .matchHeader('Content-Type', 'application/json')
        .post(quoteUrl.pathname, function (this: Definition, body) {
          assert.ok(this.headers)
          const headerMap = new Map(Object.entries(this.headers))
          const signature = headerMap.get('rafiki-signature')
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
              paymentPointerId,
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
              requestBody.sendAmount = sendAmount
            }
            if (receiveAmount) {
              requestBody.receiveAmount = receiveAmount
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
      toConnection | incomingAmount    | description
      ${true}      | ${undefined}      | ${'connection'}
      ${false}     | ${undefined}      | ${'incomingPayment'}
      ${false}     | ${incomingAmount} | ${'incomingPayment.incomingAmount'}
    `('$description', ({ toConnection, incomingAmount }): void => {
      describe.each`
        sendAmount    | receiveAmount    | paymentType                      | description
        ${sendAmount} | ${undefined}     | ${Pay.PaymentType.FixedSend}     | ${'sendAmount'}
        ${undefined}  | ${receiveAmount} | ${Pay.PaymentType.FixedDelivery} | ${'receiveAmount'}
        ${undefined}  | ${undefined}     | ${Pay.PaymentType.FixedDelivery} | ${'receiver.incomingAmount'}
      `('$description', ({ sendAmount, receiveAmount, paymentType }): void => {
        let options: CreateQuoteOptions
        let incomingPayment: IncomingPayment
        let expected: ExpectedQuote
        const client = faker.internet.url()

        beforeEach(async (): Promise<void> => {
          incomingPayment = await createIncomingPayment(deps, {
            paymentPointerId: receivingPaymentPointer.id,
            incomingAmount
          })
          const connectionService = await deps.use('connectionService')
          options = {
            paymentPointerId,
            receiver: toConnection
              ? connectionService.getUrl(incomingPayment)
              : incomingPayment.getUrl(receivingPaymentPointer)
          }
          if (sendAmount) options.sendAmount = sendAmount
          if (receiveAmount) options.receiveAmount = receiveAmount
          expected = {
            ...options,
            paymentType
          }
        })

        if (!sendAmount && !receiveAmount && !incomingAmount) {
          it('fails without receiver.incomingAmount', async (): Promise<void> => {
            await expect(quoteService.create(options)).resolves.toEqual(
              QuoteError.InvalidReceiver
            )
          })
        } else {
          if (sendAmount || receiveAmount) {
            it.each`
              client       | description
              ${client}    | ${'with a client'}
              ${undefined} | ${'without a client'}
            `(
              'creates a Quote $description',
              async ({ client }): Promise<void> => {
                const walletScope = mockWalletQuote({
                  expected
                })
                const quote = await quoteService.create({
                  ...options,
                  client
                })
                assert.ok(!isQuoteError(quote))
                walletScope.done()
                expect(quote).toMatchObject({
                  paymentPointerId,
                  receiver: options.receiver,
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
                  createdAt: expect.any(Date),
                  updatedAt: expect.any(Date),
                  expiresAt: new Date(
                    quote.createdAt.getTime() + config.quoteLifespan
                  ),
                  client: client || null
                })
                expect(quote.minExchangeRate.valueOf()).toBe(
                  0.5 * (1 - config.slippage)
                )
                expect(quote.lowEstimatedExchangeRate.valueOf()).toBe(0.5)
                expect(quote.highEstimatedExchangeRate.valueOf()).toBe(
                  0.500000000001
                )

                await expect(
                  quoteService.get({
                    id: quote.id
                  })
                ).resolves.toEqual(quote)
              }
            )

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
                scope?.done()
              })
            }
          } else {
            if (incomingAmount) {
              it.each`
                client       | description
                ${client}    | ${'with a client'}
                ${undefined} | ${'without a client'}
              `(
                'creates a Quote $description',
                async ({ client }): Promise<void> => {
                  const scope = mockWalletQuote({
                    expected
                  })
                  const quote = await quoteService.create({
                    ...options,
                    client
                  })
                  scope.done()
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
                    ),
                    client: client || null
                  })
                  expect(quote.minExchangeRate.valueOf()).toBe(
                    0.5 * (1 - config.slippage)
                  )
                  expect(quote.lowEstimatedExchangeRate.valueOf()).toBe(0.5)
                  expect(quote.highEstimatedExchangeRate.valueOf()).toBe(
                    0.500000000001
                  )
                  await expect(
                    quoteService.get({
                      id: quote.id
                    })
                  ).resolves.toEqual(quote)
                }
              )
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
                receiveAmount: serializeAmount(receiveAmount)
              })
              const quote = await quoteService.create(options)
              assert.ok(!isQuoteError(quote))
              walletScope.done()
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

              await expect(
                quoteService.get({
                  id: quote.id
                })
              ).resolves.toEqual(quote)
            })

            it.each`
              receiveAmount                                                                                 | message
              ${{ value: '100', assetCode: destinationAsset.code, assetScale: destinationAsset.scale }}     | ${'increases receiveAmount'}
              ${{ value: '0', assetCode: destinationAsset.code, assetScale: destinationAsset.scale }}       | ${'returns receiveAmount.value of 0'}
              ${{ value: '-1', assetCode: destinationAsset.code, assetScale: destinationAsset.scale }}      | ${'returns negative receiveAmount.value'}
              ${{ value: 'invalid', assetCode: destinationAsset.code, assetScale: destinationAsset.scale }} | ${'returns invalid receiveAmount.value'}
            `(
              `fails if account provider $message`,
              async ({ receiveAmount }): Promise<void> => {
                const walletScope = mockWalletQuote({
                  expected,
                  receiveAmount
                })
                await expect(quoteService.create(options)).resolves.toEqual(
                  QuoteError.InvalidAmount
                )
                walletScope.done()
              }
            )
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
                sendAmount: serializeAmount(sendAmount)
              })
              const quote = await quoteService.create(options)
              assert.ok(!isQuoteError(quote))
              walletScope.done()
              expect(quote).toMatchObject({
                paymentPointerId,
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

              await expect(
                quoteService.get({
                  id: quote.id
                })
              ).resolves.toEqual(quote)
            })

            it.each`
              sendAmount                                                              | message
              ${{ value: '100', assetCode: asset.code, assetScale: asset.scale }}     | ${'decreases sendAmount'}
              ${{ value: '0', assetCode: asset.code, assetScale: asset.scale }}       | ${'returns sendAmount.value of 0'}
              ${{ value: '-1', assetCode: asset.code, assetScale: asset.scale }}      | ${'returns negative sendAmount.value'}
              ${{ value: 'invalid', assetCode: asset.code, assetScale: asset.scale }} | ${'returns invalid sendAmount.value'}
            `(
              `fails if account provider $message`,
              async ({ sendAmount }): Promise<void> => {
                const walletScope = mockWalletQuote({
                  expected,
                  sendAmount
                })
                await expect(quoteService.create(options)).resolves.toEqual(
                  QuoteError.InvalidAmount
                )
                walletScope.done()
              }
            )
          }

          it('fails if wallet does not respond 201', async (): Promise<void> => {
            const walletScope = mockWalletQuote({
              expected,
              status: 403
            })
            await expect(quoteService.create(options)).rejects.toThrowError(
              'Request failed with status code 403'
            )
            walletScope.done()
          })

          if (!toConnection) {
            test.each`
              state
              ${IncomingPaymentState.Completed}
              ${IncomingPaymentState.Expired}
            `(
              `returns ${QuoteError.InvalidReceiver} on $state receiver`,
              async ({ state }): Promise<void> => {
                await incomingPayment.$query(knex).patch({
                  state,
                  expiresAt:
                    state === IncomingPaymentState.Expired
                      ? new Date()
                      : undefined
                })
                await expect(quoteService.create(options)).resolves.toEqual(
                  QuoteError.InvalidReceiver
                )
              }
            )
          }
        }
      })
    })

    it.each`
      expiryDate                                                            | description
      ${new Date(new Date().getTime() + Config.quoteLifespan - 2 * 60_000)} | ${"the incoming payment's expirataion date"}
      ${new Date(new Date().getTime() + Config.quoteLifespan + 2 * 60_000)} | ${"the quotation's creation date plus its lifespan"}
    `(
      'sets expiry date to $description',
      async ({ expiryDate }): Promise<void> => {
        const incomingPayment = await createIncomingPayment(deps, {
          paymentPointerId: receivingPaymentPointer.id,
          incomingAmount,
          expiresAt: expiryDate
        })
        const options: CreateQuoteOptions = {
          paymentPointerId,
          receiver: incomingPayment.getUrl(receivingPaymentPointer),
          receiveAmount
        }
        const expected: ExpectedQuote = {
          ...options,
          paymentType: Pay.PaymentType.FixedDelivery
        }

        const walletScope = mockWalletQuote({
          expected
        })
        const quote = await quoteService.create(options)
        assert.ok(!isQuoteError(quote))
        walletScope.done()
        const maxExpiration = new Date(
          quote.createdAt.getTime() + config.quoteLifespan
        )
        expect(quote).toMatchObject({
          paymentPointerId,
          receiver: options.receiver,
          sendAmount: {
            value: BigInt(
              Math.ceil(
                Number(receiveAmount.value) / quote.minExchangeRate.valueOf()
              )
            ),
            assetCode: asset.code,
            assetScale: asset.scale
          },
          receiveAmount: receiveAmount,
          maxPacketAmount: BigInt('9223372036854775807'),
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
          expiresAt:
            maxExpiration.getTime() > expiryDate.getTime()
              ? expiryDate
              : maxExpiration
        })
      }
    )

    it('fails on unknown payment pointer', async (): Promise<void> => {
      await expect(
        quoteService.create({
          paymentPointerId: uuid(),
          receiver: `${
            receivingPaymentPointer.url
          }/incoming-payments/${uuid()}`,
          sendAmount
        })
      ).resolves.toEqual(QuoteError.UnknownPaymentPointer)
    })

    it('fails on invalid receiver', async (): Promise<void> => {
      await expect(
        quoteService.create({
          paymentPointerId,
          receiver: `${
            receivingPaymentPointer.url
          }/incoming-payments/${uuid()}`,
          sendAmount
        })
      ).resolves.toEqual(QuoteError.InvalidReceiver)
    })

    test.each`
      sendAmount                              | receiveAmount                              | description
      ${{ ...sendAmount, value: BigInt(0) }}  | ${undefined}                               | ${'with sendAmount of zero'}
      ${{ ...sendAmount, value: BigInt(-1) }} | ${undefined}                               | ${'with negative sendAmount'}
      ${{ ...sendAmount, assetScale: 3 }}     | ${undefined}                               | ${'with wrong sendAmount asset'}
      ${undefined}                            | ${{ ...receiveAmount, value: BigInt(0) }}  | ${'with receiveAmount of zero'}
      ${undefined}                            | ${{ ...receiveAmount, value: BigInt(-1) }} | ${'with negative receiveAmount'}
      ${undefined}                            | ${{ ...receiveAmount, assetScale: 3 }}     | ${'with wrong receiveAmount asset'}
    `(
      'fails to create $description',
      async ({ sendAmount, receiveAmount }): Promise<void> => {
        const incomingPayment = await createIncomingPayment(deps, {
          paymentPointerId: receivingPaymentPointer.id
        })
        const options: CreateQuoteOptions = {
          paymentPointerId,
          receiver: incomingPayment.getUrl(receivingPaymentPointer)
        }
        if (sendAmount) options.sendAmount = sendAmount
        if (receiveAmount) options.receiveAmount = receiveAmount
        await expect(quoteService.create(options)).resolves.toEqual(
          QuoteError.InvalidAmount
        )
      }
    )

    it('fails on rate service error', async (): Promise<void> => {
      const ratesService = await deps.use('ratesService')
      jest
        .spyOn(ratesService, 'rates')
        .mockImplementation(() => Promise.reject(new Error('fail')))
      const incomingPayment = await createIncomingPayment(deps, {
        paymentPointerId: receivingPaymentPointer.id
      })

      await expect(
        quoteService.create({
          paymentPointerId,
          receiver: incomingPayment.getUrl(receivingPaymentPointer),
          sendAmount
        })
      ).rejects.toThrow('missing rates')
    })
  })
})
