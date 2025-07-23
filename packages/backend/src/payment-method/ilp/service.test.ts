import {
  IlpPaymentService,
  calculateMinSendAmount,
  resolveIlpDestination,
  retryableIlpErrors
} from './service'
import { initIocContainer } from '../../'
import { createTestApp, TestContainer } from '../../tests/app'
import { IAppConfig, Config } from '../../config/app'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { createAsset } from '../../tests/asset'
import { createWalletAddress } from '../../tests/walletAddress'
import { Asset } from '../../asset/model'
import { withConfigOverride } from '../../tests/helpers'
import { StartQuoteOptions } from '../handler/service'
import { WalletAddress } from '../../open_payments/wallet_address/model'
import * as Pay from '@interledger/pay'
import { Ratio, Int, PaymentType } from '@interledger/pay'
import assert from 'assert'

import { createReceiver } from '../../tests/receiver'
import { mockRatesApi } from '../../tests/rates'
import {
  PaymentMethodHandlerError,
  PaymentMethodHandlerErrorCode
} from '../handler/errors'
import { OutgoingPayment } from '../../open_payments/payment/outgoing/model'
import { AccountingService } from '../../accounting/service'
import { IncomingPayment } from '../../open_payments/payment/incoming/model'
import { truncateTables } from '../../tests/tableManager'
import { createOutgoingPaymentWithReceiver } from '../../tests/outgoingPayment'
import { v4 as uuid } from 'uuid'
import { IlpQuoteDetails } from './quote-details/model'
import { CreateOptions } from '../../tenants/settings/service'
import {
  createTenantSettings,
  exchangeRatesSetting
} from '../../tests/tenantSettings'

const nock = (global as unknown as { nock: typeof import('nock') }).nock

describe('IlpPaymentService', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let ilpPaymentService: IlpPaymentService
  let accountingService: AccountingService
  let config: IAppConfig
  let tenantId: string

  let tenantExchangeRatesUrl: string

  const assetMap: Record<string, Asset> = {}
  const walletAddressMap: Record<string, WalletAddress> = {}

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer({
      ...Config,
      exchangeRatesLifetime: 0
    })
    appContainer = await createTestApp(deps)

    config = await deps.use('config')
    ilpPaymentService = await deps.use('ilpPaymentService')
    accountingService = await deps.use('accountingService')
  })

  beforeEach(async (): Promise<void> => {
    tenantId = Config.operatorTenantId
    assetMap['USD'] = await createAsset(deps, {
      assetOptions: {
        code: 'USD',
        scale: 2
      }
    })

    assetMap['EUR'] = await createAsset(deps, {
      assetOptions: {
        code: 'EUR',
        scale: 2
      }
    })

    walletAddressMap['USD'] = await createWalletAddress(deps, {
      tenantId,
      assetId: assetMap['USD'].id
    })

    walletAddressMap['EUR'] = await createWalletAddress(deps, {
      tenantId,
      assetId: assetMap['EUR'].id
    })

    const createOptions: CreateOptions = {
      tenantId,
      setting: [exchangeRatesSetting()]
    }

    const tenantSetting = createTenantSettings(deps, createOptions)
    tenantExchangeRatesUrl = (await tenantSetting).value
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(deps)
    jest.restoreAllMocks()

    nock.cleanAll()
    nock.abortPendingRequests()
    nock.restore()
    nock.activate()
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('getQuote', (): void => {
    test('calls rates service with correct base asset', async (): Promise<void> => {
      const ratesScope = mockRatesApi(tenantExchangeRatesUrl, () => ({}))

      const options: StartQuoteOptions = {
        quoteId: uuid(),
        walletAddress: walletAddressMap['USD'],
        receiver: await createReceiver(deps, walletAddressMap['USD']),
        debitAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: 100n
        }
      }

      const ratesService = await deps.use('ratesService')
      const ratesServiceSpy = jest.spyOn(ratesService, 'rates')

      await ilpPaymentService.getQuote(options)

      expect(ratesServiceSpy).toHaveBeenCalledWith('USD', tenantId)
      ratesScope.done()
    })

    test('inserts ilpQuoteDetails', async (): Promise<void> => {
      const ratesScope = mockRatesApi(tenantExchangeRatesUrl, () => ({}))
      const quoteId = uuid()
      const options: StartQuoteOptions = {
        quoteId,
        walletAddress: walletAddressMap['USD'],
        receiver: await createReceiver(deps, walletAddressMap['USD']),
        debitAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: 100n
        }
      }

      const highEstimatedExchangeRate = Ratio.of(Int.ONE, Int.TWO)
      const lowEstimatedExchangeRate = Ratio.from(0.5)
      const minExchangeRate = Ratio.from(0.5)

      assert(highEstimatedExchangeRate)
      assert(lowEstimatedExchangeRate)
      assert(minExchangeRate)

      const mockIlpQuote = {
        paymentType: PaymentType.FixedDelivery,
        maxSourceAmount: BigInt(500),
        minDeliveryAmount: BigInt(400),
        highEstimatedExchangeRate,
        lowEstimatedExchangeRate,
        minExchangeRate,
        maxPacketAmount: BigInt('9223372036854775807')
      }

      jest.spyOn(Pay, 'startQuote').mockResolvedValue(mockIlpQuote)

      await ilpPaymentService.getQuote(options)

      const ilpQuoteDetails = await IlpQuoteDetails.query()
        .where({ quoteId })
        .first()

      ilpQuoteDetails?.lowEstimatedExchangeRate

      expect(ilpQuoteDetails).toMatchObject({
        quoteId,
        maxPacketAmount: mockIlpQuote.maxPacketAmount,
        minExchangeRate: mockIlpQuote.minExchangeRate,
        minExchangeRateNumerator: mockIlpQuote.minExchangeRate.a.toString(),
        minExchangeRateDenominator: mockIlpQuote.minExchangeRate.b.toString(),
        lowEstimatedExchangeRate: mockIlpQuote.lowEstimatedExchangeRate,
        lowEstimatedExchangeRateNumerator:
          mockIlpQuote.lowEstimatedExchangeRate.a.toString(),
        lowEstimatedExchangeRateDenominator:
          mockIlpQuote.lowEstimatedExchangeRate.b.toString(),
        highEstimatedExchangeRate: mockIlpQuote.highEstimatedExchangeRate,
        highEstimatedExchangeRateNumerator:
          mockIlpQuote.highEstimatedExchangeRate.a.toString(),
        highEstimatedExchangeRateDenominator:
          mockIlpQuote.highEstimatedExchangeRate.b.toString()
      })
      ratesScope.done()
    })

    test('creates a quote with large exchange rate amounts', async (): Promise<void> => {
      const ratesScope = mockRatesApi(tenantExchangeRatesUrl, () => ({}))
      const quoteId = uuid()
      const options: StartQuoteOptions = {
        quoteId,
        walletAddress: walletAddressMap['USD'],
        receiver: await createReceiver(deps, walletAddressMap['USD']),
        debitAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: 100n
        }
      }

      const highEstimatedExchangeRate = Ratio.of(Int.MAX_U64, Int.ONE)
      const lowEstimatedExchangeRate = Ratio.from(10 ** 20)
      const minExchangeRate = Ratio.from(0.5)

      assert(highEstimatedExchangeRate)
      assert(lowEstimatedExchangeRate)
      assert(minExchangeRate)

      const mockIlpQuote = {
        paymentType: PaymentType.FixedDelivery,
        maxSourceAmount: BigInt(500),
        minDeliveryAmount: BigInt(400),
        highEstimatedExchangeRate,
        lowEstimatedExchangeRate,
        minExchangeRate,
        maxPacketAmount: BigInt('9223372036854775807')
      }

      jest.spyOn(Pay, 'startQuote').mockResolvedValue(mockIlpQuote)

      await ilpPaymentService.getQuote(options)

      const ilpQuoteDetails = await IlpQuoteDetails.query()
        .where({ quoteId })
        .first()

      ilpQuoteDetails?.lowEstimatedExchangeRate

      expect(ilpQuoteDetails).toMatchObject({
        quoteId,
        maxPacketAmount: mockIlpQuote.maxPacketAmount,
        minExchangeRate: mockIlpQuote.minExchangeRate,
        minExchangeRateNumerator: mockIlpQuote.minExchangeRate.a.toString(),
        minExchangeRateDenominator: mockIlpQuote.minExchangeRate.b.toString(),
        lowEstimatedExchangeRate: mockIlpQuote.lowEstimatedExchangeRate,
        lowEstimatedExchangeRateNumerator:
          mockIlpQuote.lowEstimatedExchangeRate.a.toString(),
        lowEstimatedExchangeRateDenominator:
          mockIlpQuote.lowEstimatedExchangeRate.b.toString(),
        highEstimatedExchangeRate: mockIlpQuote.highEstimatedExchangeRate,
        highEstimatedExchangeRateNumerator:
          mockIlpQuote.highEstimatedExchangeRate.a.toString(),
        highEstimatedExchangeRateDenominator:
          mockIlpQuote.highEstimatedExchangeRate.b.toString()
      })
      ratesScope.done()
    })

    test('Throws if quoteId is not provided', async (): Promise<void> => {
      const options: StartQuoteOptions = {
        walletAddress: walletAddressMap['USD'],
        receiver: await createReceiver(deps, walletAddressMap['USD']),
        debitAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: 100n
        }
      }

      expect.assertions(4)
      try {
        await ilpPaymentService.getQuote(options)
      } catch (error) {
        expect(error).toBeInstanceOf(PaymentMethodHandlerError)
        expect((error as PaymentMethodHandlerError).message).toBe(
          'Received error during ILP quoting'
        )
        expect((error as PaymentMethodHandlerError).description).toBe(
          'quoteId is required for ILP quotes'
        )
        expect((error as PaymentMethodHandlerError).retryable).toBe(false)
      }
    })

    test('fails on rate service error', async (): Promise<void> => {
      const ratesService = await deps.use('ratesService')
      jest
        .spyOn(ratesService, 'rates')
        .mockImplementation(() => Promise.reject(new Error('fail')))

      expect.assertions(4)
      try {
        await ilpPaymentService.getQuote({
          quoteId: uuid(),
          walletAddress: walletAddressMap['USD'],
          receiver: await createReceiver(deps, walletAddressMap['USD']),
          debitAmount: {
            assetCode: 'USD',
            assetScale: 2,
            value: 100n
          }
        })
      } catch (err) {
        expect(err).toBeInstanceOf(PaymentMethodHandlerError)
        expect((err as PaymentMethodHandlerError).message).toBe(
          'Received error during ILP quoting'
        )
        expect((err as PaymentMethodHandlerError).description).toBe(
          'Could not get rates from service'
        )
        expect((err as PaymentMethodHandlerError).retryable).toBe(false)
      }
    })

    test('returns all fields correctly', async (): Promise<void> => {
      const ratesScope = mockRatesApi(tenantExchangeRatesUrl, () => ({}))

      const options: StartQuoteOptions = {
        quoteId: uuid(),
        walletAddress: walletAddressMap['USD'],
        receiver: await createReceiver(deps, walletAddressMap['USD']),
        debitAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: 100n
        }
      }

      await expect(ilpPaymentService.getQuote(options)).resolves.toEqual({
        receiver: options.receiver,
        walletAddress: options.walletAddress,
        debitAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: 100n
        },
        receiveAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: 99n
        },
        estimatedExchangeRate: expect.any(Number)
      })
      ratesScope.done()
    })

    test('uses receiver.incomingAmount if receiveAmount is not provided', async (): Promise<void> => {
      const ratesScope = mockRatesApi(tenantExchangeRatesUrl, () => ({}))

      const incomingAmount = {
        assetCode: 'USD',
        assetScale: 2,
        value: 100n
      }

      const options: StartQuoteOptions = {
        quoteId: uuid(),
        walletAddress: walletAddressMap['USD'],
        receiver: await createReceiver(deps, walletAddressMap['USD'], {
          incomingAmount,
          tenantId: Config.operatorTenantId
        })
      }

      const ilpStartQuoteSpy = jest.spyOn(Pay, 'startQuote')

      await expect(ilpPaymentService.getQuote(options)).resolves.toMatchObject({
        receiveAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: incomingAmount?.value
        }
      })

      expect(ilpStartQuoteSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          amountToDeliver: incomingAmount?.value
        })
      )
      ratesScope.done()
    })

    test('fails if slippage too high', async (): Promise<void> =>
      withConfigOverride(
        () => config,
        { slippage: 101 },
        async () => {
          mockRatesApi(tenantExchangeRatesUrl, () => ({}))

          expect.assertions(4)
          try {
            await ilpPaymentService.getQuote({
              quoteId: uuid(),
              walletAddress: walletAddressMap['USD'],
              receiver: await createReceiver(deps, walletAddressMap['USD']),
              debitAmount: {
                assetCode: 'USD',
                assetScale: 2,
                value: 100n
              }
            })
          } catch (error) {
            expect(error).toBeInstanceOf(PaymentMethodHandlerError)
            expect((error as PaymentMethodHandlerError).message).toBe(
              'Received error during ILP quoting'
            )
            expect((error as PaymentMethodHandlerError).description).toBe(
              Pay.PaymentError.InvalidSlippage
            )
            expect((error as PaymentMethodHandlerError).retryable).toBe(false)
          }
        }
      )())

    test('throws if quote returns invalid maxSourceAmount', async (): Promise<void> => {
      const ratesScope = mockRatesApi(tenantExchangeRatesUrl, () => ({}))

      const options: StartQuoteOptions = {
        quoteId: uuid(),
        walletAddress: walletAddressMap['USD'],
        receiver: await createReceiver(deps, walletAddressMap['USD'])
      }

      jest.spyOn(Pay, 'startQuote').mockResolvedValueOnce({
        maxSourceAmount: -1n
      } as Pay.Quote)

      expect.assertions(4)
      try {
        await ilpPaymentService.getQuote(options)
      } catch (error) {
        expect(error).toBeInstanceOf(PaymentMethodHandlerError)
        expect((error as PaymentMethodHandlerError).message).toBe(
          'Received error during ILP quoting'
        )
        expect((error as PaymentMethodHandlerError).description).toBe(
          'Maximum source amount of ILP quote is non-positive'
        )
        expect((error as PaymentMethodHandlerError).retryable).toBe(false)
      }

      ratesScope.done()
    })

    test('throws if quote returns invalid minDeliveryAmount', async (): Promise<void> => {
      const ratesScope = mockRatesApi(tenantExchangeRatesUrl, () => ({}))

      const options: StartQuoteOptions = {
        quoteId: uuid(),
        walletAddress: walletAddressMap['USD'],
        receiver: await createReceiver(deps, walletAddressMap['USD'], {
          incomingAmount: {
            assetCode: 'USD',
            assetScale: 2,
            value: 100n
          },
          tenantId: Config.operatorTenantId
        })
      }

      const highEstimatedExchangeRate = Pay.Ratio.from(0.034)

      jest.spyOn(Pay, 'startQuote').mockResolvedValueOnce({
        maxSourceAmount: 1n,
        minDeliveryAmount: -1n,
        highEstimatedExchangeRate
      } as unknown as Pay.Quote)

      expect.assertions(6)
      try {
        await ilpPaymentService.getQuote(options)
      } catch (error) {
        expect(error).toBeInstanceOf(PaymentMethodHandlerError)
        expect((error as PaymentMethodHandlerError).message).toBe(
          'Received error during ILP quoting'
        )
        expect((error as PaymentMethodHandlerError).description).toBe(
          'Minimum delivery amount of ILP quote is non-positive'
        )
        expect((error as PaymentMethodHandlerError).retryable).toBe(false)
        expect((error as PaymentMethodHandlerError).code).toBe(
          PaymentMethodHandlerErrorCode.QuoteNonPositiveReceiveAmount
        )
        expect((error as PaymentMethodHandlerError).details).toMatchObject({
          minSendAmount: 30n
        })
      }

      ratesScope.done()
    })

    test('throws if quote returns with a non-positive estimated delivery amount', async (): Promise<void> => {
      const ratesScope = mockRatesApi(tenantExchangeRatesUrl, () => ({}))

      const options: StartQuoteOptions = {
        quoteId: uuid(),
        walletAddress: walletAddressMap['USD'],
        receiver: await createReceiver(deps, walletAddressMap['USD'])
      }

      jest.spyOn(Pay, 'startQuote').mockResolvedValueOnce({
        maxSourceAmount: 10n,
        highEstimatedExchangeRate: Pay.Ratio.from(0.099)
      } as unknown as Pay.Quote)

      expect.assertions(5)
      try {
        await ilpPaymentService.getQuote(options)
      } catch (error) {
        expect(error).toBeInstanceOf(PaymentMethodHandlerError)
        expect((error as PaymentMethodHandlerError).message).toBe(
          'Received error during ILP quoting'
        )
        expect((error as PaymentMethodHandlerError).description).toBe(
          'Estimated receive amount of ILP quote is non-positive'
        )
        expect((error as PaymentMethodHandlerError).retryable).toBe(false)
        expect((error as PaymentMethodHandlerError).code).toBe(
          PaymentMethodHandlerErrorCode.QuoteNonPositiveReceiveAmount
        )
      }

      ratesScope.done()
    })

    describe('throws with details.minSendAmount', () => {
      const rate = 0.1

      test('if debitAmount is 0', async () => {
        const ratesScope = mockRatesApi(tenantExchangeRatesUrl, () => ({
          EUR: rate
        }))
        const options: StartQuoteOptions = {
          quoteId: uuid(),
          walletAddress: walletAddressMap['USD'],
          receiver: await createReceiver(deps, walletAddressMap['EUR']),
          debitAmount: {
            assetCode: 'USD',
            assetScale: 2,
            value: 0n
          }
        }
        jest.spyOn(Pay, 'startQuote').mockResolvedValueOnce({
          maxSourceAmount: 9n,
          highEstimatedExchangeRate: Pay.Ratio.from(rate)
        } as unknown as Pay.Quote)

        await expect(ilpPaymentService.getQuote(options)).rejects.toMatchObject(
          {
            description: 'Minimum delivery amount of ILP quote is non-positive',
            retryable: false,
            code: PaymentMethodHandlerErrorCode.QuoteNonPositiveReceiveAmount,
            details: {
              minSendAmount: 10n
            }
          }
        )
        ratesScope.done()
      })

      test('if estimatedReceiveAmount < 1', async () => {
        const ratesScope = mockRatesApi(tenantExchangeRatesUrl, () => ({
          EUR: rate
        }))
        const options: StartQuoteOptions = {
          quoteId: uuid(),
          walletAddress: walletAddressMap['USD'],
          receiver: await createReceiver(deps, walletAddressMap['EUR']),
          debitAmount: {
            assetCode: 'USD',
            assetScale: 2,
            value: 9n
          }
        }
        jest.spyOn(Pay, 'startQuote').mockResolvedValueOnce({
          minDeliveryAmount: 1n,
          maxSourceAmount: 9n,
          highEstimatedExchangeRate: Pay.Ratio.from(rate)
        } as unknown as Pay.Quote)

        await expect(ilpPaymentService.getQuote(options)).rejects.toMatchObject(
          {
            description:
              'Estimated receive amount of ILP quote is non-positive',
            retryable: false,
            code: PaymentMethodHandlerErrorCode.QuoteNonPositiveReceiveAmount,
            details: {
              minSendAmount: 10n
            }
          }
        )
        ratesScope.done()
      })
    })

    test('throws if invalid ILP destination', async (): Promise<void> => {
      const ratesScope = mockRatesApi(tenantExchangeRatesUrl, () => ({}))

      const incomingAmount = {
        assetCode: 'USD',
        assetScale: 2,
        value: 100n
      }

      const options: StartQuoteOptions = {
        quoteId: uuid(),
        walletAddress: walletAddressMap['USD'],
        receiver: await createReceiver(deps, walletAddressMap['USD'], {
          incomingAmount,
          tenantId: Config.operatorTenantId,
          paymentMethods: []
        })
      }

      expect.assertions(4)
      try {
        await ilpPaymentService.getQuote(options)
      } catch (error) {
        expect(error).toBeInstanceOf(PaymentMethodHandlerError)
        expect((error as PaymentMethodHandlerError).message).toBe(
          'Invalid ILP payment method on receiver'
        )
        expect((error as PaymentMethodHandlerError).description).toBe(
          'No ILP payment method found in receiver'
        )
        expect((error as PaymentMethodHandlerError).retryable).toBe(false)
      }

      ratesScope.done()
    })

    describe('successfully gets ilp quote', (): void => {
      describe('with incomingAmount', () => {
        test.each`
          incomingAssetCode | incomingAmountValue | debitAssetCode | expectedDebitAmount | exchangeRate | slippage | description
          ${'EUR'}          | ${100n}             | ${'USD'}       | ${101n}             | ${1.0}       | ${0}     | ${'same currency, no slippage'}
          ${'USD'}          | ${100n}             | ${'USD'}       | ${102n}             | ${1.0}       | ${0.01}  | ${'same currency, some slippage'}
          ${'EUR'}          | ${100n}             | ${'USD'}       | ${113n}             | ${0.9}       | ${0.01}  | ${'cross currency, exchange rate < 1'}
          ${'EUR'}          | ${100n}             | ${'USD'}       | ${51n}              | ${2.0}       | ${0.01}  | ${'cross currency, exchange rate > 1'}
        `(
          '$description',
          async ({
            incomingAssetCode,
            incomingAmountValue,
            debitAssetCode,
            expectedDebitAmount,
            slippage,
            exchangeRate
          }): Promise<void> =>
            withConfigOverride(
              () => config,
              { slippage },
              async () => {
                const ratesScope = mockRatesApi(tenantExchangeRatesUrl, () => ({
                  [incomingAssetCode]: exchangeRate
                }))

                const receivingWalletAddress =
                  walletAddressMap[incomingAssetCode]
                const sendingWalletAddress = walletAddressMap[debitAssetCode]

                const options: StartQuoteOptions = {
                  quoteId: uuid(),
                  walletAddress: sendingWalletAddress,
                  receiver: await createReceiver(deps, receivingWalletAddress),
                  receiveAmount: {
                    assetCode: receivingWalletAddress.asset.code,
                    assetScale: receivingWalletAddress.asset.scale,
                    value: incomingAmountValue
                  }
                }

                const quote = await ilpPaymentService.getQuote(options)

                expect(quote).toMatchObject({
                  debitAmount: {
                    assetCode: sendingWalletAddress.asset.code,
                    assetScale: sendingWalletAddress.asset.scale,
                    value: expectedDebitAmount
                  },
                  receiveAmount: {
                    assetCode: receivingWalletAddress.asset.code,
                    assetScale: receivingWalletAddress.asset.scale,
                    value: incomingAmountValue
                  }
                })
                ratesScope.done()
              }
            )()
        )
      })

      describe('with debitAmount', () => {
        test.each`
          debitAssetCode | debitAmountValue | incomingAssetCode | expectedReceiveAmount | exchangeRate | slippage | description
          ${'USD'}       | ${100n}          | ${'USD'}          | ${99n}                | ${1.0}       | ${0}     | ${'same currency, no slippage'}
          ${'USD'}       | ${100n}          | ${'USD'}          | ${99n}                | ${1.0}       | ${0.01}  | ${'same currency, some slippage'}
          ${'USD'}       | ${100n}          | ${'EUR'}          | ${89n}                | ${0.9}       | ${0.01}  | ${'cross currency, exchange rate < 1'}
          ${'USD'}       | ${100n}          | ${'EUR'}          | ${197n}               | ${2.0}       | ${0.01}  | ${'cross currency, exchange rate > 1'}
        `(
          '$description',
          async ({
            incomingAssetCode,
            debitAmountValue,
            debitAssetCode,
            expectedReceiveAmount,
            slippage,
            exchangeRate
          }): Promise<void> =>
            withConfigOverride(
              () => config,
              { slippage },
              async () => {
                const ratesScope = mockRatesApi(tenantExchangeRatesUrl, () => ({
                  [incomingAssetCode]: exchangeRate
                }))

                const receivingWalletAddress =
                  walletAddressMap[incomingAssetCode]
                const sendingWalletAddress = walletAddressMap[debitAssetCode]

                const options: StartQuoteOptions = {
                  quoteId: uuid(),
                  walletAddress: sendingWalletAddress,
                  receiver: await createReceiver(deps, receivingWalletAddress),
                  debitAmount: {
                    assetCode: sendingWalletAddress.asset.code,
                    assetScale: sendingWalletAddress.asset.scale,
                    value: debitAmountValue
                  }
                }

                const quote = await ilpPaymentService.getQuote(options)

                expect(quote).toMatchObject({
                  debitAmount: {
                    assetCode: sendingWalletAddress.asset.code,
                    assetScale: sendingWalletAddress.asset.scale,
                    value: debitAmountValue
                  },
                  receiveAmount: {
                    assetCode: receivingWalletAddress.asset.code,
                    assetScale: receivingWalletAddress.asset.scale,
                    value: expectedReceiveAmount
                  }
                })
                ratesScope.done()
              }
            )()
        )
      })
    })
  })

  describe('pay', (): void => {
    function mockIlpPay(
      overrideQuote: Partial<Pay.Quote>,
      error?: Pay.PaymentError
    ): jest.SpyInstance<
      Promise<Pay.PaymentProgress>,
      [options: Pay.PayOptions]
    > {
      return jest
        .spyOn(Pay, 'pay')
        .mockImplementationOnce(async (opts: Pay.PayOptions) => {
          const res = await Pay.pay({
            ...opts,
            quote: { ...opts.quote, ...overrideQuote }
          })
          if (error) res.error = error
          return res
        })
    }

    async function validateBalances(
      outgoingPayment: OutgoingPayment,
      incomingPayment: IncomingPayment,
      {
        amountSent,
        amountReceived
      }: {
        amountSent: bigint
        amountReceived: bigint
      }
    ) {
      await expect(
        accountingService.getTotalSent(outgoingPayment.id)
      ).resolves.toBe(amountSent)
      await expect(
        accountingService.getTotalReceived(incomingPayment.id)
      ).resolves.toEqual(amountReceived)
    }

    test('successfully streams between accounts', async (): Promise<void> => {
      const { incomingPayment, receiver, outgoingPayment } =
        await createOutgoingPaymentWithReceiver(deps, {
          sendingWalletAddress: walletAddressMap['USD'],
          receivingWalletAddress: walletAddressMap['USD'],
          method: 'ilp',
          quoteOptions: {
            tenantId,
            debitAmount: {
              value: 100n,
              assetScale: walletAddressMap['USD'].asset.scale,
              assetCode: walletAddressMap['USD'].asset.code
            }
          }
        })

      await expect(
        ilpPaymentService.pay({
          receiver,
          outgoingPayment,
          finalDebitAmount: 100n,
          finalReceiveAmount: 100n
        })
      ).resolves.toBeUndefined()

      await validateBalances(outgoingPayment, incomingPayment, {
        amountSent: 100n,
        amountReceived: 100n
      })
    })

    test('partially streams between accounts, then streams to completion', async (): Promise<void> => {
      const { incomingPayment, receiver, outgoingPayment } =
        await createOutgoingPaymentWithReceiver(deps, {
          sendingWalletAddress: walletAddressMap['USD'],
          receivingWalletAddress: walletAddressMap['USD'],
          method: 'ilp',
          quoteOptions: {
            tenantId,
            exchangeRate: 1,
            debitAmount: {
              value: 100n,
              assetScale: walletAddressMap['USD'].asset.scale,
              assetCode: walletAddressMap['USD'].asset.code
            }
          }
        })

      mockIlpPay(
        { maxSourceAmount: 5n, minDeliveryAmount: 5n },
        Pay.PaymentError.ClosedByReceiver
      )

      await expect(
        ilpPaymentService.pay({
          receiver,
          outgoingPayment,
          finalDebitAmount: 100n,
          finalReceiveAmount: 100n
        })
      ).rejects.toThrow(PaymentMethodHandlerError)

      await validateBalances(outgoingPayment, incomingPayment, {
        amountSent: 5n,
        amountReceived: 5n
      })

      await expect(
        ilpPaymentService.pay({
          receiver,
          outgoingPayment,
          finalDebitAmount: 100n - 5n,
          finalReceiveAmount: 100n - 5n
        })
      ).resolves.toBeUndefined()

      await validateBalances(outgoingPayment, incomingPayment, {
        amountSent: 100n,
        amountReceived: 100n
      })
    })

    test('throws if invalid finalDebitAmount', async (): Promise<void> => {
      const { incomingPayment, receiver, outgoingPayment } =
        await createOutgoingPaymentWithReceiver(deps, {
          sendingWalletAddress: walletAddressMap['USD'],
          receivingWalletAddress: walletAddressMap['USD'],
          method: 'ilp',
          quoteOptions: {
            tenantId,
            debitAmount: {
              value: 100n,
              assetScale: walletAddressMap['USD'].asset.scale,
              assetCode: walletAddressMap['USD'].asset.code
            }
          }
        })

      expect.assertions(6)
      try {
        await ilpPaymentService.pay({
          receiver,
          outgoingPayment,
          finalDebitAmount: 0n,
          finalReceiveAmount: 50n
        })
      } catch (error) {
        expect(error).toBeInstanceOf(PaymentMethodHandlerError)
        expect((error as PaymentMethodHandlerError).message).toBe(
          'Could not start ILP streaming'
        )
        expect((error as PaymentMethodHandlerError).description).toBe(
          'Invalid finalDebitAmount'
        )
        expect((error as PaymentMethodHandlerError).retryable).toBe(false)
      }

      await validateBalances(outgoingPayment, incomingPayment, {
        amountSent: 0n,
        amountReceived: 0n
      })
    })

    test('throws if invalid finalReceiveAmount', async (): Promise<void> => {
      const { incomingPayment, receiver, outgoingPayment } =
        await createOutgoingPaymentWithReceiver(deps, {
          sendingWalletAddress: walletAddressMap['USD'],
          receivingWalletAddress: walletAddressMap['USD'],
          method: 'ilp',
          quoteOptions: {
            tenantId,
            debitAmount: {
              value: 100n,
              assetScale: walletAddressMap['USD'].asset.scale,
              assetCode: walletAddressMap['USD'].asset.code
            }
          }
        })

      expect.assertions(6)
      try {
        await ilpPaymentService.pay({
          receiver,
          outgoingPayment,
          finalDebitAmount: 50n,
          finalReceiveAmount: 0n
        })
      } catch (error) {
        expect(error).toBeInstanceOf(PaymentMethodHandlerError)
        expect((error as PaymentMethodHandlerError).message).toBe(
          'Could not start ILP streaming'
        )
        expect((error as PaymentMethodHandlerError).description).toBe(
          'Invalid finalReceiveAmount'
        )
        expect((error as PaymentMethodHandlerError).retryable).toBe(false)
      }

      await validateBalances(outgoingPayment, incomingPayment, {
        amountSent: 0n,
        amountReceived: 0n
      })
    })

    test('throws if invalid ILP destination', async (): Promise<void> => {
      const { receiver, outgoingPayment } =
        await createOutgoingPaymentWithReceiver(deps, {
          sendingWalletAddress: walletAddressMap['USD'],
          receivingWalletAddress: walletAddressMap['USD'],
          method: 'ilp',
          quoteOptions: {
            tenantId,
            debitAmount: {
              value: 100n,
              assetScale: walletAddressMap['USD'].asset.scale,
              assetCode: walletAddressMap['USD'].asset.code
            }
          },
          receiverPaymentMethods: []
        })

      expect.assertions(4)
      try {
        await ilpPaymentService.pay({
          receiver,
          outgoingPayment,
          finalDebitAmount: 50n,
          finalReceiveAmount: 0n
        })
      } catch (error) {
        expect(error).toBeInstanceOf(PaymentMethodHandlerError)
        expect((error as PaymentMethodHandlerError).message).toBe(
          'Could not start ILP streaming'
        )
        expect((error as PaymentMethodHandlerError).description).toBe(
          'Invalid finalReceiveAmount'
        )
        expect((error as PaymentMethodHandlerError).retryable).toBe(false)
      }
    })

    test('throws retryable ILP error', async (): Promise<void> => {
      const { receiver, outgoingPayment } =
        await createOutgoingPaymentWithReceiver(deps, {
          sendingWalletAddress: walletAddressMap['USD'],
          receivingWalletAddress: walletAddressMap['USD'],
          method: 'ilp',
          quoteOptions: {
            tenantId,
            debitAmount: {
              value: 100n,
              assetScale: walletAddressMap['USD'].asset.scale,
              assetCode: walletAddressMap['USD'].asset.code
            }
          }
        })

      mockIlpPay({}, Object.keys(retryableIlpErrors)[0] as Pay.PaymentError)

      expect.assertions(4)
      try {
        await ilpPaymentService.pay({
          receiver,
          outgoingPayment,
          finalDebitAmount: 50n,
          finalReceiveAmount: 50n
        })
      } catch (error) {
        expect(error).toBeInstanceOf(PaymentMethodHandlerError)
        expect((error as PaymentMethodHandlerError).message).toBe(
          'Received error during ILP pay'
        )
        expect((error as PaymentMethodHandlerError).description).toBe(
          Object.keys(retryableIlpErrors)[0]
        )
        expect((error as PaymentMethodHandlerError).retryable).toBe(true)
      }
    })

    test('throws non-retryable ILP error', async (): Promise<void> => {
      const { receiver, outgoingPayment } =
        await createOutgoingPaymentWithReceiver(deps, {
          sendingWalletAddress: walletAddressMap['USD'],
          receivingWalletAddress: walletAddressMap['USD'],
          method: 'ilp',
          quoteOptions: {
            tenantId,
            debitAmount: {
              value: 100n,
              assetScale: walletAddressMap['USD'].asset.scale,
              assetCode: walletAddressMap['USD'].asset.code
            }
          }
        })

      const nonRetryableIlpError = Object.values(Pay.PaymentError).find(
        (error) => !retryableIlpErrors[error]
      )

      mockIlpPay({}, nonRetryableIlpError)

      expect.assertions(4)
      try {
        await ilpPaymentService.pay({
          receiver,
          outgoingPayment,
          finalDebitAmount: 50n,
          finalReceiveAmount: 50n
        })
      } catch (error) {
        expect(error).toBeInstanceOf(PaymentMethodHandlerError)
        expect((error as PaymentMethodHandlerError).message).toBe(
          'Received error during ILP pay'
        )
        expect((error as PaymentMethodHandlerError).description).toBe(
          nonRetryableIlpError
        )
        expect((error as PaymentMethodHandlerError).retryable).toBe(false)
      }
    })
  })

  describe('calculateMinSendAmount', (): void => {
    test('returns reciprocal of highEstimatedExchangeRate', async (): Promise<void> => {
      expect(
        calculateMinSendAmount({
          highEstimatedExchangeRate: Pay.Ratio.from(0.05)
        } as unknown as Pay.Quote)
      ).toBe(20n)
      expect(
        calculateMinSendAmount({
          highEstimatedExchangeRate: Pay.Ratio.from(0.01)
        } as unknown as Pay.Quote)
      ).toBe(100n)
    })

    test('returns at least 2 even if highEstimatedExchangeRate reciprocal under 2', async (): Promise<void> => {
      expect(
        calculateMinSendAmount({
          highEstimatedExchangeRate: Pay.Ratio.from(1)
        } as unknown as Pay.Quote)
      ).toBe(2n)
      expect(
        calculateMinSendAmount({
          highEstimatedExchangeRate: Pay.Ratio.from(20)
        } as unknown as Pay.Quote)
      ).toBe(2n)
    })
  })

  describe('resolveIlpDestination', (): void => {
    test('throws if missing payment methods on receiver', async (): Promise<void> => {
      const incomingAmount = {
        assetCode: 'USD',
        assetScale: 2,
        value: 100n
      }

      const receiver = await createReceiver(deps, walletAddressMap['USD'], {
        incomingAmount,
        tenantId: Config.operatorTenantId,
        paymentMethods: []
      })

      expect.assertions(4)
      try {
        resolveIlpDestination(receiver)
      } catch (error) {
        expect(error).toBeInstanceOf(PaymentMethodHandlerError)
        expect((error as PaymentMethodHandlerError).message).toBe(
          'Invalid ILP payment method on receiver'
        )
        expect((error as PaymentMethodHandlerError).description).toBe(
          'No ILP payment method found in receiver'
        )
        expect((error as PaymentMethodHandlerError).retryable).toBe(false)
      }
    })

    test('throws if invalid ILP address for receiver', async (): Promise<void> => {
      const incomingAmount = {
        assetCode: 'USD',
        assetScale: 2,
        value: 100n
      }

      const receiver = await createReceiver(deps, walletAddressMap['USD'], {
        incomingAmount,
        tenantId: Config.operatorTenantId,
        paymentMethods: [
          {
            type: 'ilp',
            ilpAddress: '',
            sharedSecret: ''
          }
        ]
      })

      expect.assertions(4)
      try {
        resolveIlpDestination(receiver)
      } catch (error) {
        expect(error).toBeInstanceOf(PaymentMethodHandlerError)
        expect((error as PaymentMethodHandlerError).message).toBe(
          'Invalid ILP payment method on receiver'
        )
        expect((error as PaymentMethodHandlerError).description).toBe(
          'Invalid ILP address for ILP payment method'
        )
        expect((error as PaymentMethodHandlerError).retryable).toBe(false)
      }
    })
  })
})
