import nock from 'nock'

import { IlpPaymentService } from './service'
import { initIocContainer } from '../../'
import { createTestApp, TestContainer } from '../../tests/app'
import { IAppConfig, Config } from '../../config/app'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { createAsset } from '../../tests/asset'
import { createPaymentPointer } from '../../tests/paymentPointer'
import { Asset } from '../../asset/model'
import { withConfigOverride } from '../../tests/helpers'
import { StartQuoteOptions } from '../handler/service'
import { PaymentPointer } from '../../open_payments/payment_pointer/model'
import * as Pay from '@interledger/pay'

import { createReceiver } from '../../tests/receiver'
import { mockRatesApi } from '../../tests/rates'

describe('IlpPaymentService', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let ilpPaymentService: IlpPaymentService
  let config: IAppConfig

  const exchangeRatesUrl = 'https://example-rates.com'

  const assetMap: Record<string, Asset> = {}
  const paymentPointerMap: Record<string, PaymentPointer> = {}

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer({
      ...Config,
      exchangeRatesUrl,
      exchangeRatesLifetime: 0
    })
    appContainer = await createTestApp(deps)

    config = await deps.use('config')
    ilpPaymentService = await deps.use('ilpPaymentService')

    assetMap['USD'] = await createAsset(deps, {
      code: 'USD',
      scale: 2
    })

    assetMap['EUR'] = await createAsset(deps, {
      code: 'EUR',
      scale: 2
    })

    paymentPointerMap['USD'] = await createPaymentPointer(deps, {
      assetId: assetMap['USD'].id
    })

    paymentPointerMap['EUR'] = await createPaymentPointer(deps, {
      assetId: assetMap['EUR'].id
    })
  })

  afterEach(async (): Promise<void> => {
    jest.restoreAllMocks()
    nock.cleanAll()
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('getQuote', (): void => {
    test('calls rates service with correct base asset', async (): Promise<void> => {
      const ratesScope = mockRatesApi(exchangeRatesUrl, () => ({}))

      const options: StartQuoteOptions = {
        paymentPointer: paymentPointerMap['USD'],
        receiver: await createReceiver(deps, paymentPointerMap['USD']),
        debitAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: 100n
        }
      }

      const ratesService = await deps.use('ratesService')
      const ratesServiceSpy = jest.spyOn(ratesService, 'rates')

      await ilpPaymentService.getQuote(options)

      expect(ratesServiceSpy).toHaveBeenCalledWith('USD')
      ratesScope.done()
    })

    test('fails on rate service error', async (): Promise<void> => {
      const ratesService = await deps.use('ratesService')
      jest
        .spyOn(ratesService, 'rates')
        .mockImplementation(() => Promise.reject(new Error('fail')))

      await expect(
        ilpPaymentService.getQuote({
          paymentPointer: paymentPointerMap['USD'],
          receiver: await createReceiver(deps, paymentPointerMap['USD']),
          debitAmount: {
            assetCode: 'USD',
            assetScale: 2,
            value: 100n
          }
        })
      ).rejects.toThrow('missing rates')
    })

    test('returns all fields correctly', async (): Promise<void> => {
      const ratesScope = mockRatesApi(exchangeRatesUrl, () => ({}))

      const options: StartQuoteOptions = {
        paymentPointer: paymentPointerMap['USD'],
        receiver: await createReceiver(deps, paymentPointerMap['USD']),
        debitAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: 100n
        }
      }

      await expect(ilpPaymentService.getQuote(options)).resolves.toEqual({
        receiver: options.receiver,
        paymentPointer: options.paymentPointer,
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
        additionalFields: {
          minExchangeRate: expect.any(Pay.Ratio),
          highEstimatedExchangeRate: expect.any(Pay.Ratio),
          lowEstimatedExchangeRate: expect.any(Pay.Ratio),
          maxPacketAmount: BigInt(Pay.Int.MAX_U64.toString())
        }
      })
      ratesScope.done()
    })

    test('uses receiver.incomingAmount if receiveAmount is not provided', async (): Promise<void> => {
      const ratesScope = mockRatesApi(exchangeRatesUrl, () => ({}))

      const incomingAmount = {
        assetCode: 'USD',
        assetScale: 2,
        value: 100n
      }

      const options: StartQuoteOptions = {
        paymentPointer: paymentPointerMap['USD'],
        receiver: await createReceiver(deps, paymentPointerMap['USD'], {
          incomingAmount
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
          mockRatesApi(exchangeRatesUrl, () => ({}))

          await expect(
            ilpPaymentService.getQuote({
              paymentPointer: paymentPointerMap['USD'],
              receiver: await createReceiver(deps, paymentPointerMap['USD']),
              debitAmount: {
                assetCode: 'USD',
                assetScale: 2,
                value: 100n
              }
            })
          ).rejects.toBe(Pay.PaymentError.InvalidSlippage)
        }
      )())

    test('throws if quote returns invalid maxSourceAmount', async (): Promise<void> => {
      const ratesScope = mockRatesApi(exchangeRatesUrl, () => ({}))

      const options: StartQuoteOptions = {
        paymentPointer: paymentPointerMap['USD'],
        receiver: await createReceiver(deps, paymentPointerMap['USD'])
      }

      jest.spyOn(Pay, 'startQuote').mockResolvedValueOnce({
        maxSourceAmount: -1n
      } as Pay.Quote)

      await expect(ilpPaymentService.getQuote(options)).rejects.toThrow(
        'Invalid maxSourceAmount in ILP quote'
      )

      ratesScope.done()
    })

    test('throws if quote returns invalid minDeliveryAmount', async (): Promise<void> => {
      const ratesScope = mockRatesApi(exchangeRatesUrl, () => ({}))

      const options: StartQuoteOptions = {
        paymentPointer: paymentPointerMap['USD'],
        receiver: await createReceiver(deps, paymentPointerMap['USD'], {
          incomingAmount: {
            assetCode: 'USD',
            assetScale: 2,
            value: 100n
          }
        })
      }

      jest.spyOn(Pay, 'startQuote').mockResolvedValueOnce({
        maxSourceAmount: 1n,
        minDeliveryAmount: -1n
      } as Pay.Quote)

      await expect(ilpPaymentService.getQuote(options)).rejects.toThrow(
        'Invalid minDeliveryAmount in ILP quote'
      )

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
                const ratesScope = mockRatesApi(exchangeRatesUrl, () => ({
                  [incomingAssetCode]: exchangeRate
                }))

                const receivingPaymentPointer =
                  paymentPointerMap[incomingAssetCode]
                const sendingPaymentPointer = paymentPointerMap[debitAssetCode]

                const options: StartQuoteOptions = {
                  paymentPointer: sendingPaymentPointer,
                  receiver: await createReceiver(deps, receivingPaymentPointer),
                  receiveAmount: {
                    assetCode: receivingPaymentPointer.asset.code,
                    assetScale: receivingPaymentPointer.asset.scale,
                    value: incomingAmountValue
                  }
                }

                const quote = await ilpPaymentService.getQuote(options)

                expect(quote).toMatchObject({
                  debitAmount: {
                    assetCode: sendingPaymentPointer.asset.code,
                    assetScale: sendingPaymentPointer.asset.scale,
                    value: expectedDebitAmount
                  },
                  receiveAmount: {
                    assetCode: receivingPaymentPointer.asset.code,
                    assetScale: receivingPaymentPointer.asset.scale,
                    value: incomingAmountValue
                  }
                })
                ratesScope.done()
              }
            )()
        )
      })
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
              const ratesScope = mockRatesApi(exchangeRatesUrl, () => ({
                [incomingAssetCode]: exchangeRate
              }))

              const receivingPaymentPointer =
                paymentPointerMap[incomingAssetCode]
              const sendingPaymentPointer = paymentPointerMap[debitAssetCode]

              const options: StartQuoteOptions = {
                paymentPointer: sendingPaymentPointer,
                receiver: await createReceiver(deps, receivingPaymentPointer),
                debitAmount: {
                  assetCode: sendingPaymentPointer.asset.code,
                  assetScale: sendingPaymentPointer.asset.scale,
                  value: debitAmountValue
                }
              }

              const quote = await ilpPaymentService.getQuote(options)

              expect(quote).toMatchObject({
                debitAmount: {
                  assetCode: sendingPaymentPointer.asset.code,
                  assetScale: sendingPaymentPointer.asset.scale,
                  value: debitAmountValue
                },
                receiveAmount: {
                  assetCode: receivingPaymentPointer.asset.code,
                  assetScale: receivingPaymentPointer.asset.scale,
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
