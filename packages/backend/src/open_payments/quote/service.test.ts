import assert from 'assert'
import { faker } from '@faker-js/faker'
import { Knex } from 'knex'
import { v4 as uuid } from 'uuid'

import { QuoteError, isQuoteError } from './errors'
import { QuoteService, CreateQuoteOptions } from './service'
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
import { createQuote, mockQuote } from '../../tests/quote'
import { truncateTables } from '../../tests/tableManager'
import { AssetOptions } from '../../asset/service'
import {
  IncomingPayment,
  IncomingPaymentState
} from '../payment/incoming/model'
import { getTests } from '../payment_pointer/model.test'
import { PaymentPointer } from '../payment_pointer/model'
import { Fee, FeeType } from '../../fee/model'
import { Asset } from '../../asset/model'
import { PaymentMethodHandlerService } from '../../payment-method/handler/service'
import { ReceiverService } from '../receiver/service'
import { createReceiver } from '../../tests/receiver'

describe('QuoteService', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let quoteService: QuoteService
  let paymentMethodHandlerService: PaymentMethodHandlerService
  let receiverService: ReceiverService
  let knex: Knex
  let sendingPaymentPointer: MockPaymentPointer
  let receivingPaymentPointer: MockPaymentPointer
  let config: IAppConfig

  const asset: AssetOptions = {
    scale: 9,
    code: 'USD'
  }

  const debitAmount = {
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
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)

    knex = appContainer.knex
    config = await deps.use('config')
    quoteService = await deps.use('quoteService')
    paymentMethodHandlerService = await deps.use('paymentMethodHandlerService')
    receiverService = await deps.use('receiverService')
  })

  beforeEach(async (): Promise<void> => {
    const { id: sendAssetId } = await createAsset(deps, {
      code: debitAmount.assetCode,
      scale: debitAmount.assetScale
    })
    sendingPaymentPointer = await createPaymentPointer(deps, {
      assetId: sendAssetId
    })
    const { id: destinationAssetId } = await createAsset(deps, destinationAsset)
    receivingPaymentPointer = await createPaymentPointer(deps, {
      assetId: destinationAssetId,
      mockServerPort: appContainer.openPaymentsPort
    })
  })

  afterEach(async (): Promise<void> => {
    jest.restoreAllMocks()
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('get/getPaymentPointerPage', (): void => {
    getTests({
      createModel: ({ client }) =>
        createQuote(deps, {
          paymentPointerId: sendingPaymentPointer.id,
          receiver: `${
            receivingPaymentPointer.url
          }/incoming-payments/${uuid()}`,
          debitAmount: {
            value: BigInt(56),
            assetCode: asset.code,
            assetScale: asset.scale
          },
          client,
          validDestination: false,
          withFee: true
        }),
      get: (options) => quoteService.get(options),
      list: (options) => quoteService.getPaymentPointerPage(options)
    })
  })

  describe('create', (): void => {
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
        debitAmount    | receiveAmount    | description
        ${debitAmount} | ${undefined}     | ${'debitAmount'}
        ${undefined}   | ${receiveAmount} | ${'receiveAmount'}
        ${undefined}   | ${undefined}     | ${'receiver.incomingAmount'}
      `('$description', ({ debitAmount, receiveAmount }): void => {
        let options: CreateQuoteOptions
        let incomingPayment: IncomingPayment
        const client = faker.internet.url({ appendSlash: false })

        beforeEach(async (): Promise<void> => {
          incomingPayment = await createIncomingPayment(deps, {
            paymentPointerId: receivingPaymentPointer.id,
            incomingAmount
          })
          const connectionService = await deps.use('connectionService')
          options = {
            paymentPointerId: sendingPaymentPointer.id,
            receiver: toConnection
              ? connectionService.getUrl(incomingPayment)
              : incomingPayment.getUrl(receivingPaymentPointer)
          }
          if (debitAmount) options.debitAmount = debitAmount
          if (receiveAmount) options.receiveAmount = receiveAmount
        })

        if (!debitAmount && !receiveAmount && !incomingAmount) {
          test('fails without receiver.incomingAmount', async (): Promise<void> => {
            await expect(quoteService.create(options)).resolves.toEqual(
              QuoteError.InvalidReceiver
            )
          })
        } else {
          if (debitAmount || receiveAmount) {
            test.each`
              client       | description
              ${client}    | ${'with a client'}
              ${undefined} | ${'without a client'}
            `(
              'creates a Quote $description',
              async ({ client }): Promise<void> => {
                const mockedQuote = mockQuote({
                  receiver: (await receiverService.get(
                    incomingPayment.getUrl(receivingPaymentPointer)
                  ))!,
                  paymentPointer: sendingPaymentPointer,
                  exchangeRate: 0.5,
                  ...(debitAmount
                    ? { debitAmountValue: debitAmount.value }
                    : {
                        receiveAmountValue: receiveAmount
                          ? receiveAmount.value
                          : incomingAmount.value
                      })
                })

                jest
                  .spyOn(paymentMethodHandlerService, 'getQuote')
                  .mockResolvedValueOnce(mockedQuote)

                const quote = await quoteService.create({
                  ...options,
                  client
                })
                assert.ok(!isQuoteError(quote))

                expect(quote).toMatchObject({
                  paymentPointerId: sendingPaymentPointer.id,
                  receiver: options.receiver,
                  debitAmount: debitAmount || mockedQuote.debitAmount,
                  receiveAmount: receiveAmount || mockedQuote.receiveAmount,
                  maxPacketAmount: BigInt('9223372036854775807'),
                  createdAt: expect.any(Date),
                  updatedAt: expect.any(Date),
                  expiresAt: new Date(
                    quote.createdAt.getTime() + config.quoteLifespan
                  ),
                  client: client || null
                })

                await expect(
                  quoteService.get({
                    id: quote.id
                  })
                ).resolves.toEqual(quote)
              }
            )

            if (incomingAmount) {
              test('fails if receiveAmount exceeds receiver.incomingAmount', async (): Promise<void> => {
                const mockedQuote = mockQuote({
                  receiver: (await receiverService.get(
                    incomingPayment.getUrl(receivingPaymentPointer)
                  ))!,
                  paymentPointer: sendingPaymentPointer,
                  exchangeRate: 0.5,
                  ...(debitAmount
                    ? { debitAmountValue: debitAmount.value }
                    : {
                        receiveAmountValue: receiveAmount
                          ? receiveAmount.value
                          : incomingAmount.value
                      })
                })

                jest
                  .spyOn(paymentMethodHandlerService, 'getQuote')
                  .mockResolvedValueOnce(mockedQuote)

                await incomingPayment.$query(knex).patch({
                  incomingAmount: {
                    value: BigInt(1),
                    assetCode: destinationAsset.code,
                    assetScale: destinationAsset.scale
                  }
                })
                await expect(quoteService.create(options)).resolves.toEqual(
                  QuoteError.InvalidAmount
                )
              })
            }
          } else if (incomingAmount) {
            test.each`
              client       | description
              ${client}    | ${'with a client'}
              ${undefined} | ${'without a client'}
            `(
              'creates a Quote $description',
              async ({ client }): Promise<void> => {
                const mockedQuote = mockQuote({
                  receiver: (await receiverService.get(
                    incomingPayment.getUrl(receivingPaymentPointer)
                  ))!,
                  paymentPointer: sendingPaymentPointer,
                  exchangeRate: 0.5,
                  ...(debitAmount
                    ? { debitAmountValue: debitAmount.value }
                    : {
                        receiveAmountValue: receiveAmount
                          ? receiveAmount.value
                          : incomingAmount.value
                      })
                })

                jest
                  .spyOn(paymentMethodHandlerService, 'getQuote')
                  .mockResolvedValueOnce(mockedQuote)

                const quote = await quoteService.create({
                  ...options,
                  client
                })
                assert.ok(!isQuoteError(quote))

                expect(quote).toMatchObject({
                  ...options,
                  maxPacketAmount: BigInt('9223372036854775807'),
                  debitAmount: mockedQuote.debitAmount,
                  receiveAmount: incomingAmount,
                  createdAt: expect.any(Date),
                  updatedAt: expect.any(Date),
                  expiresAt: new Date(
                    quote.createdAt.getTime() + config.quoteLifespan
                  ),
                  client: client || null
                })

                await expect(
                  quoteService.get({
                    id: quote.id
                  })
                ).resolves.toEqual(quote)
              }
            )
          }

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

    test.each`
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
          paymentPointerId: sendingPaymentPointer.id,
          receiver: incomingPayment.getUrl(receivingPaymentPointer),
          receiveAmount
        }

        const mockedQuote = mockQuote({
          receiver: (await receiverService.get(
            incomingPayment.getUrl(receivingPaymentPointer)
          ))!,
          paymentPointer: sendingPaymentPointer,
          receiveAmountValue: receiveAmount.value,
          exchangeRate: 0.5
        })

        jest
          .spyOn(paymentMethodHandlerService, 'getQuote')
          .mockResolvedValueOnce(mockedQuote)

        const quote = await quoteService.create(options)
        assert.ok(!isQuoteError(quote))
        const maxExpiration = new Date(
          quote.createdAt.getTime() + config.quoteLifespan
        )
        expect(quote).toMatchObject({
          paymentPointerId: sendingPaymentPointer.id,
          receiver: options.receiver,
          debitAmount: mockedQuote.debitAmount,
          receiveAmount: receiveAmount,
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
          expiresAt:
            maxExpiration.getTime() > expiryDate.getTime()
              ? expiryDate
              : maxExpiration
        })
      }
    )

    test('fails on unknown payment pointer', async (): Promise<void> => {
      await expect(
        quoteService.create({
          paymentPointerId: uuid(),
          receiver: `${
            receivingPaymentPointer.url
          }/incoming-payments/${uuid()}`,
          debitAmount
        })
      ).resolves.toEqual(QuoteError.UnknownPaymentPointer)
    })

    test('fails on inactive payment pointer', async () => {
      const paymentPointer = await createPaymentPointer(deps)
      const paymentPointerUpdated = await PaymentPointer.query(
        knex
      ).patchAndFetchById(paymentPointer.id, { deactivatedAt: new Date() })
      assert.ok(!paymentPointerUpdated.isActive)
      await expect(
        quoteService.create({
          paymentPointerId: paymentPointer.id,
          receiver: `${
            receivingPaymentPointer.url
          }/incoming-payments/${uuid()}`,
          debitAmount
        })
      ).resolves.toEqual(QuoteError.InactivePaymentPointer)
    })

    test('fails on invalid receiver', async (): Promise<void> => {
      await expect(
        quoteService.create({
          paymentPointerId: sendingPaymentPointer.id,
          receiver: `${
            receivingPaymentPointer.url
          }/incoming-payments/${uuid()}`,
          debitAmount
        })
      ).resolves.toEqual(QuoteError.InvalidReceiver)
    })

    test.each`
      debitAmount                              | receiveAmount                              | description
      ${{ ...debitAmount, value: BigInt(0) }}  | ${undefined}                               | ${'with debitAmount of zero'}
      ${{ ...debitAmount, value: BigInt(-1) }} | ${undefined}                               | ${'with negative debitAmount'}
      ${{ ...debitAmount, assetScale: 3 }}     | ${undefined}                               | ${'with wrong debitAmount asset'}
      ${undefined}                             | ${{ ...receiveAmount, value: BigInt(0) }}  | ${'with receiveAmount of zero'}
      ${undefined}                             | ${{ ...receiveAmount, value: BigInt(-1) }} | ${'with negative receiveAmount'}
      ${undefined}                             | ${{ ...receiveAmount, assetScale: 3 }}     | ${'with wrong receiveAmount asset'}
      ${debitAmount}                           | ${receiveAmount}                           | ${'with both send and receive amount'}
    `(
      'fails to create $description',
      async ({ debitAmount, receiveAmount }): Promise<void> => {
        const incomingPayment = await createIncomingPayment(deps, {
          paymentPointerId: receivingPaymentPointer.id
        })
        const options: CreateQuoteOptions = {
          paymentPointerId: sendingPaymentPointer.id,
          receiver: incomingPayment.getUrl(receivingPaymentPointer)
        }
        if (debitAmount) options.debitAmount = debitAmount
        if (receiveAmount) options.receiveAmount = receiveAmount
        await expect(quoteService.create(options)).resolves.toEqual(
          QuoteError.InvalidAmount
        )
      }
    )

    describe('fees - fixed delivery', (): void => {
      let asset: Asset
      let sendingPaymentPointer: PaymentPointer
      let receivingPaymentPointer: PaymentPointer

      beforeEach(async (): Promise<void> => {
        asset = await createAsset(deps, {
          code: 'USD',
          scale: 2
        })
        sendingPaymentPointer = await createPaymentPointer(deps, {
          assetId: asset.id
        })
        receivingPaymentPointer = await createPaymentPointer(deps, {
          assetId: asset.id
        })
      })

      test.each`
        incomingAmountValue | fixedFee | basisPointFee | expectedQuoteDebitAmountValue | description
        ${1000}             | ${0}     | ${0}          | ${1000n}                      | ${'no fees'}
        ${1000n}            | ${150}   | ${0}          | ${1150n}                      | ${'fixed fee'}
        ${1000n}            | ${0}     | ${200}        | ${1020n}                      | ${'basis point fee'}
        ${1000n}            | ${150}   | ${200}        | ${1170n}                      | ${'fixed and basis point fee'}
      `(
        '$description',
        async ({
          incomingAmountValue,
          fixedFee,
          basisPointFee,
          expectedQuoteDebitAmountValue
        }): Promise<void> => {
          const receiver = await createReceiver(deps, receivingPaymentPointer, {
            incomingAmount: {
              assetCode: asset.code,
              assetScale: asset.scale,
              value: incomingAmountValue
            }
          })

          await Fee.query().insertAndFetch({
            assetId: asset.id,
            type: FeeType.Sending,
            fixedFee,
            basisPointFee
          })

          const mockedQuote = mockQuote({
            receiver: receiver!,
            paymentPointer: sendingPaymentPointer,
            receiveAmountValue: incomingAmountValue
          })

          jest
            .spyOn(paymentMethodHandlerService, 'getQuote')
            .mockResolvedValueOnce(mockedQuote)

          const quote = await quoteService.create({
            paymentPointerId: sendingPaymentPointer.id,
            receiver: receiver.incomingPayment!.id
          })
          assert.ok(!isQuoteError(quote))

          expect(quote.debitAmount).toEqual({
            assetCode: asset.code,
            assetScale: asset.scale,
            value: expectedQuoteDebitAmountValue
          })
        }
      )
    })

    describe('fees - fixed send with cross-currency', (): void => {
      let sendAsset: Asset
      let receiveAsset: Asset
      let sendingPaymentPointer: PaymentPointer
      let receivingPaymentPointer: PaymentPointer

      beforeEach(async (): Promise<void> => {
        sendAsset = await createAsset(deps, {
          code: 'USD',
          scale: 2
        })
        receiveAsset = await createAsset(deps, {
          code: 'XRP',
          scale: 2
        })
        sendingPaymentPointer = await createPaymentPointer(deps, {
          assetId: sendAsset.id
        })
        receivingPaymentPointer = await createPaymentPointer(deps, {
          assetId: receiveAsset.id
        })
      })

      test.each`
        debitAmountValue | fixedFee | basisPointFee | expectedReceiveAmountValue | description
        ${200n}          | ${0}     | ${0}          | ${100n}                    | ${'no fees'}
        ${200n}          | ${20}    | ${0}          | ${90n}                     | ${'fixed fee'}
        ${200n}          | ${0}     | ${200}        | ${99n}                     | ${'basis point fee'}
        ${200n}          | ${20}    | ${200}        | ${89n}                     | ${'fixed and basis point fee'}
      `(
        '$description',
        async ({
          debitAmountValue,
          fixedFee,
          basisPointFee,
          expectedReceiveAmountValue
        }): Promise<void> => {
          const receiver = await createReceiver(deps, receivingPaymentPointer)

          await Fee.query().insertAndFetch({
            assetId: sendAsset.id,
            type: FeeType.Sending,
            fixedFee,
            basisPointFee
          })

          const mockedQuote = mockQuote({
            receiver,
            paymentPointer: sendingPaymentPointer,
            debitAmountValue,
            exchangeRate: 0.5
          })

          jest
            .spyOn(paymentMethodHandlerService, 'getQuote')
            .mockResolvedValueOnce(mockedQuote)

          const quote = await quoteService.create({
            paymentPointerId: sendingPaymentPointer.id,
            receiver: receiver.incomingPayment!.id,
            debitAmount: {
              value: debitAmountValue,
              assetCode: sendAsset.code,
              assetScale: sendAsset.scale
            }
          })
          assert.ok(!isQuoteError(quote))

          expect(quote.receiveAmount).toEqual({
            assetCode: receiveAsset.code,
            assetScale: receiveAsset.scale,
            value: expectedReceiveAmountValue
          })
        }
      )
    })
  })
})
