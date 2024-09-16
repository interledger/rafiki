import { LocalPaymentService } from './service'
import { initIocContainer } from '../../'
import { createTestApp, TestContainer } from '../../tests/app'
import {
  // IAppConfig,
  Config
} from '../../config/app'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { createAsset } from '../../tests/asset'
import { createWalletAddress } from '../../tests/walletAddress'
import { Asset } from '../../asset/model'
import { StartQuoteOptions } from '../handler/service'
import { WalletAddress } from '../../open_payments/wallet_address/model'
// import * as Pay from '@interledger/pay'

import { createReceiver } from '../../tests/receiver'
import { mockRatesApi } from '../../tests/rates'
import { AccountingService } from '../../accounting/service'
import { truncateTables } from '../../tests/tableManager'
import { createOutgoingPaymentWithReceiver } from '../../tests/outgoingPayment'
import { OutgoingPayment } from '../../open_payments/payment/outgoing/model'
import { IncomingPayment } from '../../open_payments/payment/incoming/model'

const nock = (global as unknown as { nock: typeof import('nock') }).nock

describe('LocalPaymentService', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let localPaymentService: LocalPaymentService
  let accountingService: AccountingService
  // let config: IAppConfig

  const exchangeRatesUrl = 'https://example-rates.com'

  const assetMap: Record<string, Asset> = {}
  const walletAddressMap: Record<string, WalletAddress> = {}

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer({
      ...Config,
      exchangeRatesUrl,
      exchangeRatesLifetime: 0
    })
    appContainer = await createTestApp(deps)

    // config = await deps.use('config')
    localPaymentService = await deps.use('localPaymentService')
    accountingService = await deps.use('accountingService')
  })

  beforeEach(async (): Promise<void> => {
    assetMap['USD'] = await createAsset(deps, {
      code: 'USD',
      scale: 2
    })

    assetMap['EUR'] = await createAsset(deps, {
      code: 'EUR',
      scale: 2
    })

    walletAddressMap['USD'] = await createWalletAddress(deps, {
      assetId: assetMap['USD'].id
    })

    walletAddressMap['EUR'] = await createWalletAddress(deps, {
      assetId: assetMap['EUR'].id
    })
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(appContainer.knex)
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
    // test('calls rates service with correct base asset', async (): Promise<void> => {
    //   const ratesScope = mockRatesApi(exchangeRatesUrl, () => ({}))

    //   const options: StartQuoteOptions = {
    //     walletAddress: walletAddressMap['USD'],
    //     receiver: await createReceiver(deps, walletAddressMap['USD']),
    //     debitAmount: {
    //       assetCode: 'USD',
    //       assetScale: 2,
    //       value: 100n
    //     }
    //   }

    //   const ratesService = await deps.use('ratesService')
    //   const ratesServiceSpy = jest.spyOn(ratesService, 'rates')

    //   await ilpPaymentService.getQuote(options)

    //   expect(ratesServiceSpy).toHaveBeenCalledWith('USD')
    //   ratesScope.done()
    // })

    // test('fails on rate service error', async (): Promise<void> => {
    //   const ratesService = await deps.use('ratesService')
    //   jest
    //     .spyOn(ratesService, 'rates')
    //     .mockImplementation(() => Promise.reject(new Error('fail')))

    //   expect.assertions(4)
    //   try {
    //     await ilpPaymentService.getQuote({
    //       walletAddress: walletAddressMap['USD'],
    //       receiver: await createReceiver(deps, walletAddressMap['USD']),
    //       debitAmount: {
    //         assetCode: 'USD',
    //         assetScale: 2,
    //         value: 100n
    //       }
    //     })
    //   } catch (err) {
    //     expect(err).toBeInstanceOf(PaymentMethodHandlerError)
    //     expect((err as PaymentMethodHandlerError).message).toBe(
    //       'Received error during ILP quoting'
    //     )
    //     expect((err as PaymentMethodHandlerError).description).toBe(
    //       'Could not get rates from service'
    //     )
    //     expect((err as PaymentMethodHandlerError).retryable).toBe(false)
    //   }
    // })

    // test('returns all fields correctly', async (): Promise<void> => {
    //   const ratesScope = mockRatesApi(exchangeRatesUrl, () => ({}))

    //   const options: StartQuoteOptions = {
    //     walletAddress: walletAddressMap['USD'],
    //     receiver: await createReceiver(deps, walletAddressMap['USD']),
    //     debitAmount: {
    //       assetCode: 'USD',
    //       assetScale: 2,
    //       value: 100n
    //     }
    //   }

    //   await expect(ilpPaymentService.getQuote(options)).resolves.toEqual({
    //     receiver: options.receiver,
    //     walletAddress: options.walletAddress,
    //     debitAmount: {
    //       assetCode: 'USD',
    //       assetScale: 2,
    //       value: 100n
    //     },
    //     receiveAmount: {
    //       assetCode: 'USD',
    //       assetScale: 2,
    //       value: 99n
    //     },
    //     estimatedExchangeRate: expect.any(Number),
    //     additionalFields: {
    //       minExchangeRate: expect.any(Pay.Ratio),
    //       highEstimatedExchangeRate: expect.any(Pay.Ratio),
    //       lowEstimatedExchangeRate: expect.any(Pay.Ratio),
    //       maxPacketAmount: BigInt(Pay.Int.MAX_U64.toString())
    //     }
    //   })
    //   ratesScope.done()
    // })

    // test('uses receiver.incomingAmount if receiveAmount is not provided', async (): Promise<void> => {
    //   const ratesScope = mockRatesApi(exchangeRatesUrl, () => ({}))

    //   const incomingAmount = {
    //     assetCode: 'USD',
    //     assetScale: 2,
    //     value: 100n
    //   }

    //   const options: StartQuoteOptions = {
    //     walletAddress: walletAddressMap['USD'],
    //     receiver: await createReceiver(deps, walletAddressMap['USD'], {
    //       incomingAmount
    //     })
    //   }

    //   const ilpStartQuoteSpy = jest.spyOn(Pay, 'startQuote')

    //   await expect(ilpPaymentService.getQuote(options)).resolves.toMatchObject({
    //     receiveAmount: {
    //       assetCode: 'USD',
    //       assetScale: 2,
    //       value: incomingAmount?.value
    //     }
    //   })

    //   expect(ilpStartQuoteSpy).toHaveBeenCalledWith(
    //     expect.objectContaining({
    //       amountToDeliver: incomingAmount?.value
    //     })
    //   )
    //   ratesScope.done()
    // })

    // test('fails if slippage too high', async (): Promise<void> =>
    //   withConfigOverride(
    //     () => config,
    //     { slippage: 101 },
    //     async () => {
    //       mockRatesApi(exchangeRatesUrl, () => ({}))

    //       expect.assertions(4)
    //       try {
    //         await ilpPaymentService.getQuote({
    //           walletAddress: walletAddressMap['USD'],
    //           receiver: await createReceiver(deps, walletAddressMap['USD']),
    //           debitAmount: {
    //             assetCode: 'USD',
    //             assetScale: 2,
    //             value: 100n
    //           }
    //         })
    //       } catch (error) {
    //         expect(error).toBeInstanceOf(PaymentMethodHandlerError)
    //         expect((error as PaymentMethodHandlerError).message).toBe(
    //           'Received error during ILP quoting'
    //         )
    //         expect((error as PaymentMethodHandlerError).description).toBe(
    //           Pay.PaymentError.InvalidSlippage
    //         )
    //         expect((error as PaymentMethodHandlerError).retryable).toBe(false)
    //       }
    //     }
    //   )())

    // test('throws if quote returns invalid maxSourceAmount', async (): Promise<void> => {
    //   const ratesScope = mockRatesApi(exchangeRatesUrl, () => ({}))

    //   const options: StartQuoteOptions = {
    //     walletAddress: walletAddressMap['USD'],
    //     receiver: await createReceiver(deps, walletAddressMap['USD'])
    //   }

    //   jest.spyOn(Pay, 'startQuote').mockResolvedValueOnce({
    //     maxSourceAmount: -1n
    //   } as Pay.Quote)

    //   expect.assertions(4)
    //   try {
    //     await ilpPaymentService.getQuote(options)
    //   } catch (error) {
    //     expect(error).toBeInstanceOf(PaymentMethodHandlerError)
    //     expect((error as PaymentMethodHandlerError).message).toBe(
    //       'Received error during ILP quoting'
    //     )
    //     expect((error as PaymentMethodHandlerError).description).toBe(
    //       'Maximum source amount of ILP quote is non-positive'
    //     )
    //     expect((error as PaymentMethodHandlerError).retryable).toBe(false)
    //   }

    //   ratesScope.done()
    // })

    // test('throws if quote returns invalid minDeliveryAmount', async (): Promise<void> => {
    //   const ratesScope = mockRatesApi(exchangeRatesUrl, () => ({}))

    //   const options: StartQuoteOptions = {
    //     walletAddress: walletAddressMap['USD'],
    //     receiver: await createReceiver(deps, walletAddressMap['USD'], {
    //       incomingAmount: {
    //         assetCode: 'USD',
    //         assetScale: 2,
    //         value: 100n
    //       }
    //     })
    //   }

    //   jest.spyOn(Pay, 'startQuote').mockResolvedValueOnce({
    //     maxSourceAmount: 1n,
    //     minDeliveryAmount: -1n
    //   } as Pay.Quote)

    //   expect.assertions(5)
    //   try {
    //     await ilpPaymentService.getQuote(options)
    //   } catch (error) {
    //     expect(error).toBeInstanceOf(PaymentMethodHandlerError)
    //     expect((error as PaymentMethodHandlerError).message).toBe(
    //       'Received error during ILP quoting'
    //     )
    //     expect((error as PaymentMethodHandlerError).description).toBe(
    //       'Minimum delivery amount of ILP quote is non-positive'
    //     )
    //     expect((error as PaymentMethodHandlerError).retryable).toBe(false)
    //     expect((error as PaymentMethodHandlerError).code).toBe(
    //       PaymentMethodHandlerErrorCode.QuoteNonPositiveReceiveAmount
    //     )
    //   }

    //   ratesScope.done()
    // })

    // test('throws if quote returns with a non-positive estimated delivery amount', async (): Promise<void> => {
    //   const ratesScope = mockRatesApi(exchangeRatesUrl, () => ({}))

    //   const options: StartQuoteOptions = {
    //     walletAddress: walletAddressMap['USD'],
    //     receiver: await createReceiver(deps, walletAddressMap['USD'])
    //   }

    //   jest.spyOn(Pay, 'startQuote').mockResolvedValueOnce({
    //     maxSourceAmount: 10n,
    //     highEstimatedExchangeRate: Pay.Ratio.from(0.099)
    //   } as Pay.Quote)

    //   expect.assertions(5)
    //   try {
    //     await ilpPaymentService.getQuote(options)
    //   } catch (error) {
    //     expect(error).toBeInstanceOf(PaymentMethodHandlerError)
    //     expect((error as PaymentMethodHandlerError).message).toBe(
    //       'Received error during ILP quoting'
    //     )
    //     expect((error as PaymentMethodHandlerError).description).toBe(
    //       'Estimated receive amount of ILP quote is non-positive'
    //     )
    //     expect((error as PaymentMethodHandlerError).retryable).toBe(false)
    //     expect((error as PaymentMethodHandlerError).code).toBe(
    //       PaymentMethodHandlerErrorCode.QuoteNonPositiveReceiveAmount
    //     )
    //   }

    //   ratesScope.done()
    // })

    describe('successfully gets local quote', (): void => {
      describe('with incomingAmount', () => {
        test.each`
          incomingAssetCode | incomingAmountValue | debitAssetCode | expectedDebitAmount | exchangeRate | description
          ${'EUR'}          | ${100n}             | ${'USD'}       | ${100n}             | ${1.0}       | ${'cross currency, same rate'}
          ${'EUR'}          | ${100n}             | ${'USD'}       | ${111n}             | ${0.9}       | ${'cross currency, exchange rate < 1'}
          ${'EUR'}          | ${100n}             | ${'USD'}       | ${50n}              | ${2.0}       | ${'cross currency, exchange rate > 1'}
        `(
          // TODO: seperate test with this case (and dont mock the mockRatesApi).
          // no `each` needed.
          // test.each`
          //   incomingAssetCode | incomingAmountValue | debitAssetCode | expectedDebitAmount | exchangeRate | description
          //   ${'USD'}          | ${100n}             | ${'USD'}       | ${100n}             | ${1.0}       | ${'same currency'}
          // `(
          '$description',
          async ({
            incomingAssetCode,
            incomingAmountValue,
            debitAssetCode,
            expectedDebitAmount,
            exchangeRate
          }): Promise<void> => {
            // TODO: investigate this further.
            // - Is the expectedDebitAmount correct in these tests?
            // - Is the mockRatesApi return different than ilp getQuote test (which is [incomingAmountAssetCode]: exchangeRate)
            // because we do convertRatesToIlpPrices (which inverts) in ilp getQuote? (I think so...)
            // - just convert the exchangeRate test arg instead of inversing here (0.9 -> 1.1., 2.0 -> .5 etc)?
            //   I started with the exchangeRates as they are simply because I copy/pasted from ilp getQuote tests
            const ratesScope = mockRatesApi(exchangeRatesUrl, () => ({
              [debitAssetCode]: 1 / exchangeRate
            }))

            const receivingWalletAddress = walletAddressMap[incomingAssetCode]
            const sendingWalletAddress = walletAddressMap[debitAssetCode]

            const options: StartQuoteOptions = {
              walletAddress: sendingWalletAddress,
              receiver: await createReceiver(deps, receivingWalletAddress),
              receiveAmount: {
                assetCode: receivingWalletAddress.asset.code,
                assetScale: receivingWalletAddress.asset.scale,
                value: incomingAmountValue
              }
            }

            const quote = await localPaymentService.getQuote(options)

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
        )
      })

      describe('with debitAmount', () => {
        test.each`
          debitAssetCode | debitAmountValue | incomingAssetCode | expectedReceiveAmount | exchangeRate | description
          ${'EUR'}       | ${100n}          | ${'USD'}          | ${100n}               | ${1.0}       | ${'cross currency, same rate'}
          ${'USD'}       | ${100n}          | ${'EUR'}          | ${90n}                | ${0.9}       | ${'cross currency, exchange rate < 1'}
          ${'USD'}       | ${100n}          | ${'EUR'}          | ${200n}               | ${2.0}       | ${'cross currency, exchange rate > 1'}
        `(
          // TODO: seperate test with this case (and dont mock the mockRatesApi).
          // no `each` needed.
          // test.each`
          //   debitAssetCode | debitAmountValue | incomingAssetCode | expectedReceiveAmount | exchangeRate | description
          //   ${'USD'}       | ${100n}          | ${'USD'}          | ${100n}               | ${1.0}       | ${'same currency'}
          // `(
          '$description',
          async ({
            incomingAssetCode,
            debitAmountValue,
            debitAssetCode,
            expectedReceiveAmount,
            exchangeRate
          }): Promise<void> => {
            const ratesScope = mockRatesApi(exchangeRatesUrl, () => ({
              [incomingAssetCode]: exchangeRate
            }))

            const receivingWalletAddress = walletAddressMap[incomingAssetCode]
            const sendingWalletAddress = walletAddressMap[debitAssetCode]

            const options: StartQuoteOptions = {
              walletAddress: sendingWalletAddress,
              receiver: await createReceiver(deps, receivingWalletAddress),
              debitAmount: {
                assetCode: sendingWalletAddress.asset.code,
                assetScale: sendingWalletAddress.asset.scale,
                value: debitAmountValue
              }
            }

            const quote = await localPaymentService.getQuote(options)

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
        )
      })
    })
  })

  describe('pay', (): void => {
    // function mockIlpPay(
    //   overrideQuote: Partial<Pay.Quote>,
    //   error?: Pay.PaymentError
    // ): jest.SpyInstance<
    //   Promise<Pay.PaymentProgress>,
    //   [options: Pay.PayOptions]
    // > {
    //   return jest
    //     .spyOn(Pay, 'pay')
    //     .mockImplementationOnce(async (opts: Pay.PayOptions) => {
    //       const res = await Pay.pay({
    //         ...opts,
    //         quote: { ...opts.quote, ...overrideQuote }
    //       })
    //       if (error) res.error = error
    //       return res
    //     })
    // }

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

    test('succesfully make local payment', async (): Promise<void> => {
      const { incomingPayment, receiver, outgoingPayment } =
        await createOutgoingPaymentWithReceiver(deps, {
          sendingWalletAddress: walletAddressMap['USD'],
          receivingWalletAddress: walletAddressMap['USD'],
          method: 'ilp',
          quoteOptions: {
            debitAmount: {
              value: 100n,
              assetScale: walletAddressMap['USD'].asset.scale,
              assetCode: walletAddressMap['USD'].asset.code
            }
          }
        })

      const payResponse = await localPaymentService.pay({
        receiver,
        outgoingPayment,
        finalDebitAmount: 100n,
        finalReceiveAmount: 100n
      })

      expect(payResponse).toBe(undefined)

      await validateBalances(outgoingPayment, incomingPayment, {
        amountSent: 100n,
        amountReceived: 100n
      })
    })

    test.only('succesfully make local payment with fee', async (): Promise<void> => {
      // for this case, the underyling outgoing payment that gets created should have a quote that with amounts
      // that look like:
      // {
      //     "id": "a6a157d7-93ab-4104-b590-3cae00a30798",
      //     "walletAddressId": "9683a8bf-2a24-4dc1-853e-9d11d6681115",
      //     "receiver": "https://cloud-nine-wallet-backend/incoming-payments/c1617263-3b29-4d6b-9561-a5723b3e16ac",
      //     "debitAmount": {
      //         "value": "610",
      //         "assetCode": "USD",
      //         "assetScale": 2
      //     },
      //     "receiveAmount": {
      //         "value": "500",
      //         "assetCode": "USD",
      //         "assetScale": 2
      //     },
      //     "createdAt": "2024-08-21T17:45:07.227Z",
      //     "expiresAt": "2024-08-21T17:50:07.227Z"
      // }
      const { incomingPayment, receiver, outgoingPayment } =
        await createOutgoingPaymentWithReceiver(deps, {
          sendingWalletAddress: walletAddressMap['USD'],
          receivingWalletAddress: walletAddressMap['USD'],
          method: 'ilp',
          quoteOptions: {
            debitAmount: {
              value: 610n,
              assetScale: walletAddressMap['USD'].asset.scale,
              assetCode: walletAddressMap['USD'].asset.code
            }
          }
        })

      expect(true).toBe(false)

      const payResponse = await localPaymentService.pay({
        receiver,
        outgoingPayment,
        finalDebitAmount: 100n,
        finalReceiveAmount: 100n
      })

      expect(payResponse).toBe(undefined)

      await validateBalances(outgoingPayment, incomingPayment, {
        amountSent: 100n,
        amountReceived: 100n
      })
    })

    // test('successfully streams between accounts', async (): Promise<void> => {
    //   const { incomingPayment, receiver, outgoingPayment } =
    //     await createOutgoingPaymentWithReceiver(deps, {
    //       sendingWalletAddress: walletAddressMap['USD'],
    //       receivingWalletAddress: walletAddressMap['USD'],
    //       method: 'ilp',
    //       quoteOptions: {
    //         debitAmount: {
    //           value: 100n,
    //           assetScale: walletAddressMap['USD'].asset.scale,
    //           assetCode: walletAddressMap['USD'].asset.code
    //         }
    //       }
    //     })

    //   await expect(
    //     ilpPaymentService.pay({
    //       receiver,
    //       outgoingPayment,
    //       finalDebitAmount: 100n,
    //       finalReceiveAmount: 100n
    //     })
    //   ).resolves.toBeUndefined()

    //   await validateBalances(outgoingPayment, incomingPayment, {
    //     amountSent: 100n,
    //     amountReceived: 100n
    //   })
    // })

    // test('partially streams between accounts, then streams to completion', async (): Promise<void> => {
    //   const { incomingPayment, receiver, outgoingPayment } =
    //     await createOutgoingPaymentWithReceiver(deps, {
    //       sendingWalletAddress: walletAddressMap['USD'],
    //       receivingWalletAddress: walletAddressMap['USD'],
    //       method: 'ilp',
    //       quoteOptions: {
    //         exchangeRate: 1,
    //         debitAmount: {
    //           value: 100n,
    //           assetScale: walletAddressMap['USD'].asset.scale,
    //           assetCode: walletAddressMap['USD'].asset.code
    //         }
    //       }
    //     })

    //   mockIlpPay(
    //     { maxSourceAmount: 5n, minDeliveryAmount: 5n },
    //     Pay.PaymentError.ClosedByReceiver
    //   )

    //   await expect(
    //     ilpPaymentService.pay({
    //       receiver,
    //       outgoingPayment,
    //       finalDebitAmount: 100n,
    //       finalReceiveAmount: 100n
    //     })
    //   ).rejects.toThrow(PaymentMethodHandlerError)

    //   await validateBalances(outgoingPayment, incomingPayment, {
    //     amountSent: 5n,
    //     amountReceived: 5n
    //   })

    //   await expect(
    //     ilpPaymentService.pay({
    //       receiver,
    //       outgoingPayment,
    //       finalDebitAmount: 100n - 5n,
    //       finalReceiveAmount: 100n - 5n
    //     })
    //   ).resolves.toBeUndefined()

    //   await validateBalances(outgoingPayment, incomingPayment, {
    //     amountSent: 100n,
    //     amountReceived: 100n
    //   })
    // })

    // test('throws if invalid finalDebitAmount', async (): Promise<void> => {
    //   const { incomingPayment, receiver, outgoingPayment } =
    //     await createOutgoingPaymentWithReceiver(deps, {
    //       sendingWalletAddress: walletAddressMap['USD'],
    //       receivingWalletAddress: walletAddressMap['USD'],
    //       method: 'ilp',
    //       quoteOptions: {
    //         debitAmount: {
    //           value: 100n,
    //           assetScale: walletAddressMap['USD'].asset.scale,
    //           assetCode: walletAddressMap['USD'].asset.code
    //         }
    //       }
    //     })

    //   expect.assertions(6)
    //   try {
    //     await ilpPaymentService.pay({
    //       receiver,
    //       outgoingPayment,
    //       finalDebitAmount: 0n,
    //       finalReceiveAmount: 50n
    //     })
    //   } catch (error) {
    //     expect(error).toBeInstanceOf(PaymentMethodHandlerError)
    //     expect((error as PaymentMethodHandlerError).message).toBe(
    //       'Could not start ILP streaming'
    //     )
    //     expect((error as PaymentMethodHandlerError).description).toBe(
    //       'Invalid finalDebitAmount'
    //     )
    //     expect((error as PaymentMethodHandlerError).retryable).toBe(false)
    //   }

    //   await validateBalances(outgoingPayment, incomingPayment, {
    //     amountSent: 0n,
    //     amountReceived: 0n
    //   })
    // })

    // test('throws if invalid finalReceiveAmount', async (): Promise<void> => {
    //   const { incomingPayment, receiver, outgoingPayment } =
    //     await createOutgoingPaymentWithReceiver(deps, {
    //       sendingWalletAddress: walletAddressMap['USD'],
    //       receivingWalletAddress: walletAddressMap['USD'],
    //       method: 'ilp',
    //       quoteOptions: {
    //         debitAmount: {
    //           value: 100n,
    //           assetScale: walletAddressMap['USD'].asset.scale,
    //           assetCode: walletAddressMap['USD'].asset.code
    //         }
    //       }
    //     })

    //   expect.assertions(6)
    //   try {
    //     await ilpPaymentService.pay({
    //       receiver,
    //       outgoingPayment,
    //       finalDebitAmount: 50n,
    //       finalReceiveAmount: 0n
    //     })
    //   } catch (error) {
    //     expect(error).toBeInstanceOf(PaymentMethodHandlerError)
    //     expect((error as PaymentMethodHandlerError).message).toBe(
    //       'Could not start ILP streaming'
    //     )
    //     expect((error as PaymentMethodHandlerError).description).toBe(
    //       'Invalid finalReceiveAmount'
    //     )
    //     expect((error as PaymentMethodHandlerError).retryable).toBe(false)
    //   }

    //   await validateBalances(outgoingPayment, incomingPayment, {
    //     amountSent: 0n,
    //     amountReceived: 0n
    //   })
    // })

    // test('throws retryable ILP error', async (): Promise<void> => {
    //   const { receiver, outgoingPayment } =
    //     await createOutgoingPaymentWithReceiver(deps, {
    //       sendingWalletAddress: walletAddressMap['USD'],
    //       receivingWalletAddress: walletAddressMap['USD'],
    //       method: 'ilp',
    //       quoteOptions: {
    //         debitAmount: {
    //           value: 100n,
    //           assetScale: walletAddressMap['USD'].asset.scale,
    //           assetCode: walletAddressMap['USD'].asset.code
    //         }
    //       }
    //     })

    //   mockIlpPay({}, Object.keys(retryableIlpErrors)[0] as Pay.PaymentError)

    //   expect.assertions(4)
    //   try {
    //     await ilpPaymentService.pay({
    //       receiver,
    //       outgoingPayment,
    //       finalDebitAmount: 50n,
    //       finalReceiveAmount: 50n
    //     })
    //   } catch (error) {
    //     expect(error).toBeInstanceOf(PaymentMethodHandlerError)
    //     expect((error as PaymentMethodHandlerError).message).toBe(
    //       'Received error during ILP pay'
    //     )
    //     expect((error as PaymentMethodHandlerError).description).toBe(
    //       Object.keys(retryableIlpErrors)[0]
    //     )
    //     expect((error as PaymentMethodHandlerError).retryable).toBe(true)
    //   }
    // })

    // test('throws non-retryable ILP error', async (): Promise<void> => {
    //   const { receiver, outgoingPayment } =
    //     await createOutgoingPaymentWithReceiver(deps, {
    //       sendingWalletAddress: walletAddressMap['USD'],
    //       receivingWalletAddress: walletAddressMap['USD'],
    //       method: 'ilp',
    //       quoteOptions: {
    //         debitAmount: {
    //           value: 100n,
    //           assetScale: walletAddressMap['USD'].asset.scale,
    //           assetCode: walletAddressMap['USD'].asset.code
    //         }
    //       }
    //     })

    //   const nonRetryableIlpError = Object.values(Pay.PaymentError).find(
    //     (error) => !retryableIlpErrors[error]
    //   )

    //   mockIlpPay({}, nonRetryableIlpError)

    //   expect.assertions(4)
    //   try {
    //     await ilpPaymentService.pay({
    //       receiver,
    //       outgoingPayment,
    //       finalDebitAmount: 50n,
    //       finalReceiveAmount: 50n
    //     })
    //   } catch (error) {
    //     expect(error).toBeInstanceOf(PaymentMethodHandlerError)
    //     expect((error as PaymentMethodHandlerError).message).toBe(
    //       'Received error during ILP pay'
    //     )
    //     expect((error as PaymentMethodHandlerError).description).toBe(
    //       nonRetryableIlpError
    //     )
    //     expect((error as PaymentMethodHandlerError).retryable).toBe(false)
    //   }
    // })
  })
})
