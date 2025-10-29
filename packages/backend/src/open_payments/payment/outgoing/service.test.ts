import assert from 'assert'
import { faker } from '@faker-js/faker'
import { Knex } from 'knex'
import { v4 as uuid } from 'uuid'

import {
  FundingError,
  LifecycleError,
  OutgoingPaymentError,
  isOutgoingPaymentError
} from './errors'
import { CreateOutgoingPaymentOptions, OutgoingPaymentService } from './service'
import { createTestApp, TestContainer } from '../../../tests/app'
import { Config, IAppConfig } from '../../../config/app'
import { Grant } from '../../auth/middleware'
import { CreateQuoteOptions, QuoteService } from '../../quote/service'
import { createAsset } from '../../../tests/asset'
import { createIncomingPayment } from '../../../tests/incomingPayment'
import { createOutgoingPayment } from '../../../tests/outgoingPayment'
import {
  createWalletAddress,
  MockWalletAddress
} from '../../../tests/walletAddress'
import { createPeer } from '../../../tests/peer'
import { createQuote } from '../../../tests/quote'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../../'
import { AppServices } from '../../../app'
import { truncateTables } from '../../../tests/tableManager'
import {
  OutgoingPayment,
  OutgoingPaymentGrant,
  OutgoingPaymentState,
  PaymentData,
  OutgoingPaymentEvent,
  OutgoingPaymentEventType,
  OutgoingPaymentGrantSpentAmounts
} from './model'
import { RETRY_BACKOFF_SECONDS } from './worker'
import { IncomingPayment, IncomingPaymentState } from '../incoming/model'
import { isTransferError } from '../../../accounting/errors'
import { AccountingService } from '../../../accounting/service'
import { AssetOptions } from '../../../asset/service'
import { Amount } from '../../amount'
import { getTests } from '../../wallet_address/model.test'
import { Quote } from '../../quote/model'
import { WalletAddress } from '../../wallet_address/model'
import { PaymentMethodHandlerService } from '../../../payment-method/handler/service'
import { PaymentMethodHandlerError } from '../../../payment-method/handler/errors'
import { mockRatesApi } from '../../../tests/rates'
import { UnionOmit } from '../../../shared/utils'
import { QuoteError } from '../../quote/errors'
import { withConfigOverride } from '../../../tests/helpers'
import { TelemetryService } from '../../../telemetry/service'
import { getPageTests } from '../../../shared/baseModel.test'
import { Pagination, SortOrder } from '../../../shared/baseModel'
import { ReceiverService } from '../../receiver/service'

describe('OutgoingPaymentService', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let outgoingPaymentService: OutgoingPaymentService
  let accountingService: AccountingService
  let paymentMethodHandlerService: PaymentMethodHandlerService
  let quoteService: QuoteService
  let telemetryService: TelemetryService
  let knex: Knex
  let assetId: string
  let walletAddressId: string
  let incomingPayment: IncomingPayment
  let receiverWalletAddress: MockWalletAddress
  let receiver: string
  let client: string
  let amtDelivered: bigint
  let config: IAppConfig
  let receiverService: ReceiverService
  let receiverGet: typeof receiverService.get

  const asset: AssetOptions = {
    scale: 9,
    code: 'USD'
  }

  const debitAmount: Amount = {
    value: BigInt(123),
    assetCode: asset.code,
    assetScale: asset.scale
  }

  const destinationAsset = {
    scale: 9,
    code: 'XRP'
  }

  const exchangeRate = 0.5

  const webhookTypes: {
    [key in OutgoingPaymentState]: OutgoingPaymentEventType | undefined
  } = {
    [OutgoingPaymentState.Funding]: OutgoingPaymentEventType.PaymentCreated,
    [OutgoingPaymentState.Sending]: undefined,
    [OutgoingPaymentState.Failed]: OutgoingPaymentEventType.PaymentFailed,
    [OutgoingPaymentState.Completed]: OutgoingPaymentEventType.PaymentCompleted,
    [OutgoingPaymentState.Cancelled]: undefined
  }

  async function processNext(
    paymentId: string,
    expectState: OutgoingPaymentState,
    expectedError?: string
  ): Promise<OutgoingPayment> {
    await expect(outgoingPaymentService.processNext()).resolves.toBe(paymentId)
    const payment = await outgoingPaymentService.get({
      id: paymentId
    })
    if (!payment) throw 'no payment'
    if (expectState) expect(payment.state).toBe(expectState)
    expect(payment.error).toEqual(expectedError || null)
    const type = webhookTypes[payment.state]
    if (type) {
      await expect(
        OutgoingPaymentEvent.query(knex).where({
          type
        })
      ).resolves.not.toHaveLength(0)
    }
    return payment
  }

  async function makeTransfer(args: {
    incomingPayment: IncomingPayment
    receiveAmount: bigint
    outgoingPayment: OutgoingPayment
    debitAmount: bigint
  }): Promise<void> {
    const transfer = await accountingService.createTransfer({
      sourceAccount: args.outgoingPayment,
      destinationAccount: incomingPayment,
      sourceAmount: args.debitAmount,
      destinationAmount: args.receiveAmount,
      timeout: 0
    })

    assert.ok(!isTransferError(transfer))

    await transfer.post()

    amtDelivered += args.receiveAmount
  }

  function mockPaymentHandlerPay(
    outgoingPayment: OutgoingPayment,
    incomingPayment: IncomingPayment,
    error?: PaymentMethodHandlerError
  ) {
    return jest
      .spyOn(paymentMethodHandlerService, 'pay')
      .mockImplementationOnce(async (_, args) => {
        if (error) throw error

        await makeTransfer({
          outgoingPayment,
          incomingPayment,
          debitAmount: args.finalDebitAmount,
          receiveAmount: args.finalReceiveAmount
        })

        return {
          debit: args.finalDebitAmount,
          receive: args.finalReceiveAmount
        }
      })
  }

  // Mock the time to fast-forward to the time that the specified (absolute, not relative) attempt is scheduled.
  function fastForwardToAttempt(stateAttempts: number): void {
    jest
      .spyOn(Date, 'now')
      .mockReturnValue(
        Date.now() + stateAttempts * RETRY_BACKOFF_SECONDS * 1000
      )
  }

  async function payIncomingPayment(amount: bigint): Promise<void> {
    await expect(
      accountingService.createDeposit({
        id: uuid(),
        account: incomingPayment,
        amount
      })
    ).resolves.toBeUndefined()
    const totalReceived = await accountingService.getTotalReceived(
      incomingPayment.id
    )
    assert.ok(totalReceived)
    await incomingPayment.onCredit({
      totalReceived
    })
  }

  async function expectOutcome(
    payment: OutgoingPayment,
    {
      amountSent,
      amountDelivered,
      accountBalance,
      incomingPaymentReceived,
      withdrawAmount,
      client
    }: {
      amountSent?: bigint
      amountDelivered?: bigint
      accountBalance?: bigint
      incomingPaymentReceived?: bigint
      withdrawAmount?: bigint
      client?: string
    }
  ) {
    if (amountSent !== undefined) {
      expect(payment.sentAmount.value).toEqual(amountSent)
      await expect(accountingService.getTotalSent(payment.id)).resolves.toBe(
        payment.sentAmount.value
      )
    }

    if (amountDelivered !== undefined) {
      expect(amtDelivered).toEqual(amountDelivered)
    }
    if (accountBalance !== undefined) {
      await expect(accountingService.getBalance(payment.id)).resolves.toEqual(
        accountBalance
      )
    }
    if (incomingPaymentReceived !== undefined) {
      await expect(
        accountingService.getTotalReceived(incomingPayment.id)
      ).resolves.toEqual(incomingPaymentReceived)
    }
    if (withdrawAmount !== undefined && withdrawAmount > 0) {
      await expect(
        OutgoingPaymentEvent.query(knex).where({
          withdrawalAccountId: payment.id,
          withdrawalAmount: withdrawAmount
        })
      ).resolves.toHaveLength(1)
    }
    if (client !== undefined) {
      expect(payment.client).toEqual(client)
    }
  }

  beforeAll(async (): Promise<void> => {
    const exchangeRatesUrl = 'https://test.rates'

    mockRatesApi(exchangeRatesUrl, () => ({
      XRP: exchangeRate
    }))

    deps = await initIocContainer({
      ...Config,
      exchangeRatesUrl,
      enableTelemetry: true,
      localCacheDuration: 0
    })
    appContainer = await createTestApp(deps)
    outgoingPaymentService = await deps.use('outgoingPaymentService')
    accountingService = await deps.use('accountingService')
    paymentMethodHandlerService = await deps.use('paymentMethodHandlerService')
    quoteService = await deps.use('quoteService')
    telemetryService = (await deps.use('telemetry'))!
    config = await deps.use('config')
    knex = appContainer.knex
    receiverService = await deps.use('receiverService')
  })

  beforeEach(async (): Promise<void> => {
    const { id: sendAssetId } = await createAsset(deps, asset)
    assetId = sendAssetId
    const walletAddress = await createWalletAddress(deps, {
      assetId: sendAssetId
    })
    walletAddressId = walletAddress.id
    client = walletAddress.url
    const { id: destinationAssetId } = await createAsset(deps, destinationAsset)
    receiverWalletAddress = await createWalletAddress(deps, {
      assetId: destinationAssetId,
      mockServerPort: appContainer.openPaymentsPort
    })
    await expect(
      accountingService.createDeposit({
        id: uuid(),
        account: receiverWalletAddress.asset,
        amount: BigInt(123)
      })
    ).resolves.toBeUndefined()

    incomingPayment = await createIncomingPayment(deps, {
      walletAddressId: receiverWalletAddress.id
    })
    receiver = incomingPayment.getUrl(config.openPaymentsUrl)

    amtDelivered = BigInt(0)

    // Make receivers non-local by default
    receiverGet = receiverService.get
    jest
      .spyOn(receiverService, 'get')
      .mockImplementation(async (url: string) => {
        // call original instead of receiverService.get to avoid infinite loop
        const receiver = await receiverGet.call(receiverService, url)
        if (receiver) {
          // "as any" to circumvent "readonly" check (compile time only) to allow overriding "isLocal" here
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(receiver.isLocal as any) = false
          return receiver
        }
        return undefined
      })
  })

  afterEach(async (): Promise<void> => {
    jest.restoreAllMocks()
    receiverWalletAddress.scope?.persist(false)
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('get/getWalletAddressPage', (): void => {
    getTests({
      createModel: ({ client }) =>
        createOutgoingPayment(deps, {
          walletAddressId,
          client,
          receiver,
          debitAmount,
          validDestination: false,
          method: 'ilp'
        }),
      get: (options) => outgoingPaymentService.get(options),
      list: (options) => outgoingPaymentService.getWalletAddressPage(options)
    })
  })

  describe('get', (): void => {
    test('throws error if cannot find liquidity account for SENDING payment', async () => {
      const quote = await createQuote(deps, {
        walletAddressId,
        receiver,
        debitAmount,
        method: 'ilp'
      })

      const payment = await outgoingPaymentService.create({
        walletAddressId,
        quoteId: quote.id,
        client
      })
      assert.ok(!isOutgoingPaymentError(payment))

      await expect(
        outgoingPaymentService.get({
          id: payment.id,
          client
        })
      ).resolves.toEqual(payment)
      await expect(
        outgoingPaymentService.fund({
          id: payment.id,
          amount: payment.debitAmount.value,
          transferId: uuid()
        })
      ).resolves.toBeDefined()
      jest
        .spyOn(accountingService, 'getTotalSent')
        .mockResolvedValueOnce(undefined)
      await expect(
        outgoingPaymentService.get({
          id: payment.id,
          client
        })
      ).rejects.toThrow(
        'Could not get amount sent for payment. There was a problem getting the associated liquidity account.'
      )
    })
  })

  describe('getPage', (): void => {
    getPageTests({
      createModel: () =>
        createOutgoingPayment(deps, {
          walletAddressId,
          client,
          receiver,
          debitAmount: {
            assetCode: asset.code,
            assetScale: asset.scale,
            value: BigInt(10)
          },
          validDestination: true,
          method: 'ilp'
        }),
      getPage: (pagination?: Pagination, sortOrder?: SortOrder) =>
        outgoingPaymentService.getPage({ pagination, sortOrder })
    })

    describe('filters', () => {
      let otherSenderWalletAddress: WalletAddress
      let otherReceiver: string
      let outgoingPayment: OutgoingPayment
      let otherOutgoingPayment: OutgoingPayment
      beforeEach(async (): Promise<void> => {
        otherSenderWalletAddress = await createWalletAddress(deps, { assetId })
        const incomingPayment = await createIncomingPayment(deps, {
          walletAddressId: receiverWalletAddress.id
        })
        otherReceiver = incomingPayment.getUrl(config.openPaymentsUrl)

        outgoingPayment = await createOutgoingPayment(deps, {
          walletAddressId,
          client,
          receiver,
          debitAmount: {
            assetCode: asset.code,
            assetScale: asset.scale,
            value: BigInt(10)
          },
          validDestination: true,
          method: 'ilp'
        })

        otherOutgoingPayment = await createOutgoingPayment(deps, {
          walletAddressId: otherSenderWalletAddress.id,
          client,
          receiver: otherReceiver,
          debitAmount: {
            assetCode: asset.code,
            assetScale: asset.scale,
            value: BigInt(10)
          },
          validDestination: true,
          method: 'ilp'
        })
      })

      test('can filter by receiver', async (): Promise<void> => {
        const page = await outgoingPaymentService.getPage({
          filter: {
            receiver: { in: [receiver] }
          }
        })

        expect(page).toContainEqual(
          expect.objectContaining({ id: outgoingPayment.id })
        )
        expect(page).not.toContainEqual(
          expect.objectContaining({
            id: otherOutgoingPayment.id,
            receiver: otherReceiver
          })
        )
      })

      test('can filter by wallet address', async (): Promise<void> => {
        const page = await outgoingPaymentService.getPage({
          filter: {
            walletAddressId: { in: [walletAddressId] }
          }
        })

        expect(page).toContainEqual(
          expect.objectContaining({ id: outgoingPayment.id, walletAddressId })
        )
        expect(page).not.toContainEqual(
          expect.objectContaining({ id: otherOutgoingPayment.id })
        )
      })

      test('can filter by state', async (): Promise<void> => {
        await OutgoingPayment.query(knex).patchAndFetchById(
          outgoingPayment.id,
          {
            state: OutgoingPaymentState.Completed
          }
        )

        const page = await outgoingPaymentService.getPage({
          filter: {
            state: { in: [OutgoingPaymentState.Completed] }
          }
        })

        expect(page).toContainEqual(
          expect.objectContaining({
            id: outgoingPayment.id,
            state: OutgoingPaymentState.Completed
          })
        )
        expect(page).not.toContainEqual(
          expect.objectContaining({ id: otherOutgoingPayment.id })
        )
      })
    })
  })

  describe('getWalletAddressPage', (): void => {
    test('throws error if cannot find liquidity account for SENDING payment', async () => {
      const quote = await createQuote(deps, {
        walletAddressId,
        receiver,
        debitAmount,
        method: 'ilp'
      })

      const payment = await outgoingPaymentService.create({
        walletAddressId,
        client,
        quoteId: quote.id
      })
      assert.ok(!isOutgoingPaymentError(payment))

      await expect(
        outgoingPaymentService.get({
          id: payment.id,
          client
        })
      ).resolves.toEqual(payment)
      await expect(
        outgoingPaymentService.fund({
          id: payment.id,
          amount: payment.debitAmount.value,
          transferId: uuid()
        })
      ).resolves.toBeDefined()
      jest
        .spyOn(accountingService, 'getAccountsTotalSent')
        .mockResolvedValueOnce([undefined])
      await expect(
        outgoingPaymentService.getWalletAddressPage({
          walletAddressId: walletAddressId
        })
      ).rejects.toThrow(
        'Could not get amount sent for payment. There was a problem getting the associated liquidity account.'
      )
    })
  })

  describe('cancel', (): void => {
    const states: [
      string,
      OutgoingPaymentState,
      OutgoingPaymentError | null,
      string | undefined
    ][] = Object.values(OutgoingPaymentState).flatMap((state) => [
      [
        `should ${state == OutgoingPaymentState.Funding ? 'cancel' : 'not cancel'} outgoing payment in ${state} state with reason`,
        state,
        state == OutgoingPaymentState.Funding
          ? null
          : OutgoingPaymentError.WrongState,
        'Not enough balance'
      ],
      [
        `should ${state == OutgoingPaymentState.Funding ? 'cancel' : 'not cancel'} outgoing payment in ${state} state without reason`,
        state,
        state == OutgoingPaymentState.Funding
          ? null
          : OutgoingPaymentError.WrongState,
        undefined
      ]
    ])
    it.each(states)(
      '%s',
      async (_, state, outgoingPaymentError, reason): Promise<void> => {
        /**
         * 1. Create outgoing payment
         * 2. Update the state of outgoing payment
         * 3. Cancel outgoing payment
         * 4. Based on state, check the result
         */
        const outgoingPayment = await createOutgoingPayment(deps, {
          walletAddressId,
          client,
          receiver,
          debitAmount: {
            assetCode: asset.code,
            assetScale: asset.scale,
            value: BigInt(10)
          },
          validDestination: true,
          method: 'ilp'
        })

        await outgoingPayment.$query(knex).patch({ state })

        const response = await outgoingPaymentService.cancel({
          id: outgoingPayment.id,
          reason
        })

        if (!outgoingPaymentError) {
          assert.ok(response instanceof OutgoingPayment)
          expect(response.id).toBe(outgoingPayment.id)
          expect(response.state).toBe(OutgoingPaymentState.Cancelled)
          expect(response.metadata).toEqual({
            cancellationReason: reason
          })
        } else {
          expect(response as OutgoingPaymentError).toBe(outgoingPaymentError)
        }
      }
    )

    describe('Grant Spent Amounts', () => {
      beforeEach(async (): Promise<void> => {
        jest.useFakeTimers()
      })
      afterEach(async (): Promise<void> => {
        jest.useRealTimers()
      })

      test('should not create spent amounts record when cancelling payment without grant', async (): Promise<void> => {
        const payment = await createOutgoingPayment(deps, {
          walletAddressId,
          client,
          receiver,
          debitAmount: {
            value: BigInt(100),
            assetCode: asset.code,
            assetScale: asset.scale
          },
          validDestination: false,
          method: 'ilp'
        })

        const cancelResult = await outgoingPaymentService.cancel({
          id: payment.id
        })

        assert.ok(cancelResult instanceof OutgoingPayment)
        expect(cancelResult.state).toBe(OutgoingPaymentState.Cancelled)

        // Verify no spent amounts records exist
        const spentAmounts = await OutgoingPaymentGrantSpentAmounts.query(
          knex
        ).where({ outgoingPaymentId: payment.id })

        expect(spentAmounts).toHaveLength(0)
      })

      test('should revert grant spent amounts with interval when cancelling payment', async (): Promise<void> => {
        // jest.useFakeTimers()
        // jest.setSystemTime(new Date('2025-01-02T00:00:00Z'))

        const grant: Grant = {
          id: uuid(),
          limits: {
            debitAmount: {
              value: BigInt(1000),
              assetCode: asset.code,
              assetScale: asset.scale
            },
            interval: 'R/2025-01-01T00:00:00Z/P1M'
          }
        }
        await OutgoingPaymentGrant.query(knex).insertAndFetch({
          id: grant.id
        })

        const paymentAmount = BigInt(100)

        // Create first payment
        const firstPayment = await createOutgoingPayment(deps, {
          walletAddressId,
          client,
          receiver,
          debitAmount: {
            value: paymentAmount,
            assetCode: asset.code,
            assetScale: asset.scale
          },
          grant,
          validDestination: false,
          method: 'ilp'
        })

        jest.advanceTimersByTime(500)

        // Create second payment
        const secondPaymentAmount = BigInt(200)
        const secondPayment = await createOutgoingPayment(deps, {
          walletAddressId,
          client,
          receiver: `${Config.openPaymentsUrl}/incoming-payments/${uuid()}`,
          debitAmount: {
            value: secondPaymentAmount,
            assetCode: asset.code,
            assetScale: asset.scale
          },
          grant,
          validDestination: false,
          method: 'ilp'
        })

        jest.advanceTimersByTime(500)

        // Verify spent amounts before cancellation
        const beforeCancelSpentAmounts =
          await OutgoingPaymentGrantSpentAmounts.query(knex)
            .where({ grantId: grant.id })
            .orderBy('createdAt', 'desc')
            .first()

        assert(beforeCancelSpentAmounts)
        expect(beforeCancelSpentAmounts).toMatchObject({
          grantId: grant.id,
          outgoingPaymentId: secondPayment.id,
          paymentDebitAmountValue: secondPaymentAmount,
          intervalDebitAmountValue: paymentAmount + secondPaymentAmount,
          grantTotalDebitAmountValue: paymentAmount + secondPaymentAmount,
          paymentState: OutgoingPaymentState.Funding
        })

        // Cancel the second payment
        const cancelResult = await outgoingPaymentService.cancel({
          id: secondPayment.id,
          reason: 'Testing interval cancellation'
        })

        assert.ok(cancelResult instanceof OutgoingPayment)
        expect(cancelResult.state).toBe(OutgoingPaymentState.Cancelled)

        // Verify spent amounts were reverted correctly
        const afterCancelSpentAmounts =
          await OutgoingPaymentGrantSpentAmounts.query(knex)
            .where({ grantId: grant.id })
            .orderBy('createdAt', 'desc')
            .first()

        assert(afterCancelSpentAmounts)
        expect(afterCancelSpentAmounts.id).not.toBe(beforeCancelSpentAmounts.id)
        expect(afterCancelSpentAmounts).toMatchObject({
          grantId: grant.id,
          outgoingPaymentId: secondPayment.id,
          paymentDebitAmountValue: 0n,
          paymentReceiveAmountValue: 0n,
          intervalDebitAmountValue: firstPayment.debitAmount.value,
          intervalReceiveAmountValue: firstPayment.receiveAmount.value,
          grantTotalDebitAmountValue: firstPayment.debitAmount.value,
          grantTotalReceiveAmountValue: firstPayment.receiveAmount.value,
          paymentState: OutgoingPaymentState.Cancelled,
          intervalStart: expect.any(Date),
          intervalEnd: expect.any(Date)
        })
      })
    })
  })

  describe('create', (): void => {
    enum GrantOption {
      Existing = 'existing',
      New = 'new',
      None = 'no'
    }

    test('create from incoming payment', async () => {
      const walletAddressId = receiverWalletAddress.id
      const incomingPaymentUrl = incomingPayment.toOpenPaymentsTypeWithMethods(
        config.openPaymentsUrl,
        receiverWalletAddress
      ).id
      const debitAmount = {
        value: BigInt(123),
        assetCode: receiverWalletAddress.asset.code,
        assetScale: receiverWalletAddress.asset.scale
      }

      const quoteSpy = jest.spyOn(quoteService, 'create')

      const payment = await outgoingPaymentService.create({
        walletAddressId,
        debitAmount,
        incomingPayment: incomingPaymentUrl
      })

      expect(!isOutgoingPaymentError(payment)).toBeTruthy()
      expect(quoteSpy).toHaveBeenCalledWith({
        walletAddressId,
        receiver: incomingPaymentUrl,
        debitAmount,
        method: 'ilp'
      })
      await expect(
        OutgoingPaymentGrantSpentAmounts.query(knex)
      ).resolves.toEqual([])
    })

    test(
      'create many outgoing payments against one grant with debit amount limit',
      withConfigOverride(
        () => config,
        { slippage: 0 },
        async (): Promise<void> => {
          const debitAmount = {
            value: BigInt(10),
            assetCode: receiverWalletAddress.asset.code,
            assetScale: receiverWalletAddress.asset.scale
          }
          const grant: Grant = {
            id: uuid(),
            limits: {
              debitAmount: {
                value: BigInt(Number.MAX_SAFE_INTEGER),
                assetCode: receiverWalletAddress.asset.code,
                assetScale: receiverWalletAddress.asset.scale
              }
            }
          }
          await OutgoingPaymentGrant.query(knex).insertAndFetch({
            id: grant.id
          })

          const options: CreateOutgoingPaymentOptions = {
            walletAddressId: receiverWalletAddress.id,
            debitAmount,
            incomingPayment: incomingPayment.toOpenPaymentsTypeWithMethods(
              config.openPaymentsUrl,
              receiverWalletAddress
            ).id,
            grant
          }

          for (let i = 0; i < 3; i++) {
            const payment = await outgoingPaymentService.create(options)
            assert.ok(!isOutgoingPaymentError(payment))
            expect(payment.grantSpentDebitAmount?.value ?? 0n).toBe(
              BigInt(debitAmount.value * BigInt(i))
            )
          }
        }
      )
    )

    test(
      'create many outgoing payments against one grant with receive amount limit',
      withConfigOverride(
        () => config,
        { slippage: 0 },
        async (): Promise<void> => {
          const debitAmount = {
            value: BigInt(10),
            assetCode: receiverWalletAddress.asset.code,
            assetScale: receiverWalletAddress.asset.scale
          }
          const grant: Grant = {
            id: uuid(),
            limits: {
              receiveAmount: {
                value: BigInt(Number.MAX_SAFE_INTEGER),
                assetCode: receiverWalletAddress.asset.code,
                assetScale: receiverWalletAddress.asset.scale
              }
            }
          }
          await OutgoingPaymentGrant.query(knex).insertAndFetch({
            id: grant.id
          })

          const options: CreateOutgoingPaymentOptions = {
            walletAddressId: receiverWalletAddress.id,
            debitAmount,
            incomingPayment: incomingPayment.toOpenPaymentsTypeWithMethods(
              config.openPaymentsUrl,
              receiverWalletAddress
            ).id,
            grant
          }

          // Must account for interledger/pay off-by-one issue (even with 0 slippage/fees)
          const adjustedReceiveAmountValue = debitAmount.value - 1n

          for (let i = 0; i < 3; i++) {
            const payment = await outgoingPaymentService.create(options)
            assert.ok(!isOutgoingPaymentError(payment))

            expect(payment.grantSpentReceiveAmount?.value ?? 0n).toBe(
              adjustedReceiveAmountValue * BigInt(i)
            )

            const spentAmounts = await OutgoingPaymentGrantSpentAmounts.query(
              knex
            )
              .where({ outgoingPaymentId: payment.id })
              .first()
            assert(spentAmounts)

            expect(spentAmounts).toEqual(
              expect.objectContaining({
                grantId: grant.id,
                outgoingPaymentId: payment.id,
                debitAmountCode: debitAmount.assetCode,
                debitAmountScale: debitAmount.assetScale,
                paymentDebitAmountValue: debitAmount.value,
                grantTotalDebitAmountValue: debitAmount.value * BigInt(i + 1),
                receiveAmountCode: debitAmount.assetCode,
                receiveAmountScale: debitAmount.assetScale,
                paymentReceiveAmountValue: adjustedReceiveAmountValue,
                grantTotalReceiveAmountValue:
                  adjustedReceiveAmountValue * BigInt(i + 1),
                intervalDebitAmountValue: null,
                intervalReceiveAmountValue: null,
                intervalStart: null,
                intervalEnd: null,
                paymentState: 'FUNDING'
              })
            )
          }
        }
      )
    )

    test('fails to create quote from incoming payment', async () => {
      const walletAddressId = receiverWalletAddress.id
      const incomingPaymentUrl = incomingPayment.toOpenPaymentsTypeWithMethods(
        config.openPaymentsUrl,
        receiverWalletAddress
      ).id
      const debitAmount = {
        value: BigInt(123),
        assetCode: receiverWalletAddress.asset.code,
        assetScale: receiverWalletAddress.asset.scale
      }

      const quoteCreateResponse = QuoteError.InvalidAmount
      const quoteSpy = jest
        .spyOn(quoteService, 'create')
        .mockImplementationOnce(async () => quoteCreateResponse)

      const payment = await outgoingPaymentService.create({
        walletAddressId,
        debitAmount,
        incomingPayment: incomingPaymentUrl
      })

      expect(isOutgoingPaymentError(payment)).toBeTruthy()
      expect(payment).toBe(quoteCreateResponse)
      expect(quoteSpy).toHaveBeenCalledWith({
        walletAddressId,
        receiver: incomingPaymentUrl,
        debitAmount,
        method: 'ilp'
      })
    })

    describe.each`
      grantOption
      ${GrantOption.Existing}
      ${GrantOption.New}
      ${GrantOption.None}
    `('$grantOption grant', ({ grantOption }): void => {
      let grant: Grant | undefined
      let client: string | undefined

      beforeEach(async (): Promise<void> => {
        if (grantOption !== GrantOption.None) {
          grant = {
            id: uuid()
          }
          client = faker.internet.url({ appendSlash: false })
          if (grantOption === GrantOption.Existing) {
            await OutgoingPaymentGrant.query(knex).insertAndFetch({
              id: grant.id
            })
          }
        }
      })

      describe('incoming payment receiver', (): void => {
        it.each`
          outgoingPeer | description
          ${false}     | ${''}
          ${true}      | ${'with an outgoing peer'}
        `(
          'creates an OutgoingPayment from a quote $description',
          async ({ outgoingPeer }): Promise<void> => {
            const peerService = await deps.use('peerService')
            const peer = await createPeer(deps)
            const quote = await createQuote(deps, {
              walletAddressId,
              receiver,
              debitAmount,
              method: 'ilp'
            })
            const options = {
              walletAddressId,
              client,
              quoteId: quote.id,
              metadata: {
                description: 'rent',
                externalRef: '202201',
                items: [1, 2, 3]
              }
            }
            if (outgoingPeer) {
              jest
                .spyOn(peerService, 'getByDestinationAddress')
                .mockResolvedValueOnce(peer)
            }
            const payment = await outgoingPaymentService.create(options)
            assert.ok(!isOutgoingPaymentError(payment))
            expect(payment).toMatchObject({
              id: quote.id,
              walletAddressId,
              receiver: quote.receiver,
              debitAmount: quote.debitAmount,
              receiveAmount: quote.receiveAmount,
              metadata: options.metadata,
              state: OutgoingPaymentState.Funding,
              asset: quote.asset,
              peerId: outgoingPeer ? peer.id : null
            })

            await expect(
              outgoingPaymentService.get({
                id: payment.id
              })
            ).resolves.toEqual(payment)

            const expectedPaymentData: Partial<PaymentData> = {
              id: payment.id,
              client: payment.client
            }
            if (outgoingPeer) {
              expectedPaymentData.peerId = peer.id
            }
            await expect(
              OutgoingPaymentEvent.query(knex).where({
                type: OutgoingPaymentEventType.PaymentCreated
              })
            ).resolves.toMatchObject([
              {
                data: expectedPaymentData,
                outgoingPaymentId: payment.id
              }
            ])
          }
        )
      })

      it('fails to create on unknown wallet address', async () => {
        const { id: quoteId } = await createQuote(deps, {
          walletAddressId,
          receiver,
          debitAmount,
          validDestination: false,
          method: 'ilp'
        })
        await expect(
          outgoingPaymentService.create({
            walletAddressId: uuid(),
            quoteId
          })
        ).resolves.toEqual(OutgoingPaymentError.UnknownWalletAddress)
      })

      it('fails to create on unknown quote', async () => {
        await expect(
          outgoingPaymentService.create({
            walletAddressId,
            quoteId: uuid()
          })
        ).resolves.toEqual(OutgoingPaymentError.UnknownQuote)
      })

      it('fails to create on "consumed" quote', async () => {
        const { quote } = await createOutgoingPayment(deps, {
          walletAddressId,
          client,
          receiver,
          validDestination: false,
          method: 'ilp'
        })
        await expect(
          outgoingPaymentService.create({
            walletAddressId,
            client,
            quoteId: quote.id
          })
        ).resolves.toEqual(OutgoingPaymentError.InvalidQuote)
      })

      it('fails to create on invalid quote wallet address', async () => {
        const quote = await createQuote(deps, {
          walletAddressId,
          receiver,
          debitAmount,
          validDestination: false,
          method: 'ilp'
        })
        await expect(
          outgoingPaymentService.create({
            walletAddressId: receiverWalletAddress.id,
            quoteId: quote.id
          })
        ).resolves.toEqual(OutgoingPaymentError.InvalidQuote)
      })

      it('fails to create on expired quote', async () => {
        const quote = await createQuote(deps, {
          walletAddressId,
          receiver,
          debitAmount,
          validDestination: false,
          method: 'ilp'
        })
        await quote.$query(knex).patch({
          expiresAt: new Date(Date.now() - 1000)
        })
        await expect(
          outgoingPaymentService.create({
            walletAddressId,
            quoteId: quote.id
          })
        ).resolves.toEqual(OutgoingPaymentError.InvalidQuote)
      })
      it.each`
        state
        ${IncomingPaymentState.Completed}
        ${IncomingPaymentState.Expired}
      `(
        `fails to create on $state quote receiver`,
        async ({ state }): Promise<void> => {
          const quote = await createQuote(deps, {
            walletAddressId,
            receiver,
            debitAmount,
            method: 'ilp'
          })
          await incomingPayment.$query(knex).patch({
            state,
            expiresAt:
              state === IncomingPaymentState.Expired ? new Date() : undefined
          })
          await expect(
            outgoingPaymentService.create({
              walletAddressId,
              quoteId: quote.id
            })
          ).resolves.toEqual(OutgoingPaymentError.InvalidQuote)
        }
      )

      test('fails to create on inactive wallet address', async () => {
        const { id: quoteId } = await createQuote(deps, {
          walletAddressId,
          receiver,
          debitAmount,
          validDestination: false,
          method: 'ilp'
        })
        const walletAddress = await createWalletAddress(deps)
        const walletAddressUpdated = await WalletAddress.query(
          knex
        ).patchAndFetchById(walletAddress.id, { deactivatedAt: new Date() })
        assert.ok(!walletAddressUpdated.isActive)
        await expect(
          outgoingPaymentService.create({
            walletAddressId: walletAddress.id,
            quoteId
          })
        ).resolves.toEqual(OutgoingPaymentError.InactiveWalletAddress)
      })

      if (grantOption !== GrantOption.None) {
        test('fails to create if grant is locked', async () => {
          assert.ok(grant)
          grant.limits = {
            receiver,
            debitAmount
          }
          const quotes = await Promise.all(
            [0, 1].map(async (_) => {
              return await createQuote(deps, {
                walletAddressId,
                receiver,
                debitAmount,
                method: 'ilp'
              })
            })
          )
          const options = quotes.map((quote) => {
            return {
              walletAddressId,
              client,
              quoteId: quote.id,
              metadata: {
                description: 'rent',
                externalRef: '202201'
              },
              grant,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              callback: (f: any) => setTimeout(f, 20),
              grantLockTimeoutMs: 20
            }
          })

          if (grantOption === GrantOption.Existing) {
            await expect(
              Promise.all(
                options.map(async (option) => {
                  return await outgoingPaymentService.create(option)
                })
              )
            ).rejects.toThrowError(
              'Defined query timeout of 20ms exceeded when running query.'
            )
          } else {
            await Promise.all(
              options.map(async (option) => {
                return await outgoingPaymentService.create(option)
              })
            )
          }
          const payments = await OutgoingPayment.query(knex)
          expect(payments.length).toEqual(1)
          expect([quotes[0].id, quotes[1].id]).toContain(payments[0].id)
        })

        describe('validateGrant', (): void => {
          let quote: Quote
          let options: UnionOmit<CreateOutgoingPaymentOptions, 'grant'>
          let interval: string
          beforeEach(async (): Promise<void> => {
            quote = await createQuote(deps, {
              walletAddressId,
              receiver,
              debitAmount,
              method: 'ilp'
            })
            options = {
              walletAddressId,
              quoteId: quote.id,
              metadata: {
                description: 'rent',
                externalRef: '202201'
              },
              client
            }
            const start = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
            interval = `R0/${start.toISOString()}/P1M`
          })
          test('fails if grant limits interval does not cover now', async (): Promise<void> => {
            const start = new Date(Date.now() + 24 * 60 * 60 * 1000)
            assert.ok(grant)
            grant.limits = {
              debitAmount: debitAmount,
              interval: `R0/${start.toISOString()}/P1M`
            }
            await expect(
              outgoingPaymentService.create({ ...options, grant })
            ).resolves.toEqual(OutgoingPaymentError.InsufficientGrant)
          })
          test('succeeds if grant limit receiver matches payment receiver', async (): Promise<void> => {
            assert.ok(grant)
            grant.limits = {
              ...grant.limits,
              receiver
            }
            const quote = await createQuote(deps, {
              walletAddressId,
              receiver,
              debitAmount,
              validDestination: false,
              method: 'ilp'
            })
            await expect(
              outgoingPaymentService.create({
                ...options,
                grant,
                quoteId: quote.id
              })
            ).resolves.toBeInstanceOf(OutgoingPayment)
          })
          test('fails if grant limit receiver does not match payment receiver', async (): Promise<void> => {
            assert.ok(grant)
            grant.limits = {
              ...grant.limits,
              receiver: 'http://another.wallet/address'
            }
            await expect(
              outgoingPaymentService.create({ ...options, grant })
            ).resolves.toEqual(OutgoingPaymentError.InsufficientGrant)
          })
          test.each`
            limits                                                                         | withInterval | description
            ${{ debitAmount: { assetCode: 'EUR', assetScale: asset.scale } }}              | ${true}      | ${'debitAmount asset code with interval'}
            ${{ debitAmount: { assetCode: asset.code, assetScale: 2 } }}                   | ${true}      | ${'debitAmount asset scale with interval'}
            ${{ receiveAmount: { assetCode: 'EUR', assetScale: destinationAsset.scale } }} | ${true}      | ${'receiveAmount asset code with interval'}
            ${{ receiveAmount: { assetCode: destinationAsset.code, assetScale: 2 } }}      | ${true}      | ${'receiveAmount asset scale with interval'}
            ${{ debitAmount: { assetCode: 'EUR', assetScale: asset.scale } }}              | ${false}     | ${'debitAmount asset code without interval'}
            ${{ debitAmount: { assetCode: asset.code, assetScale: 2 } }}                   | ${false}     | ${'debitAmount asset scale without interval'}
            ${{ receiveAmount: { assetCode: 'EUR', assetScale: destinationAsset.scale } }} | ${false}     | ${'receiveAmount asset code without interval'}
            ${{ receiveAmount: { assetCode: destinationAsset.code, assetScale: 2 } }}      | ${false}     | ${'receiveAmount asset scale without interval'}
          `(
            'fails if grant limits do not match payment - $description',
            async ({ limits, withInterval }): Promise<void> => {
              assert.ok(grant)
              const grantLimits = { ...limits }
              if (withInterval) {
                grantLimits.interval = interval
              }
              grant.limits = grantLimits

              await expect(
                outgoingPaymentService.create({ ...options, grant })
              ).resolves.toEqual(OutgoingPaymentError.InsufficientGrant)
            }
          )
          test.each`
            debitAmount | withInterval | description
            ${true}     | ${true}      | ${'debitAmount with interval'}
            ${false}    | ${true}      | ${'receiveAmount with interval'}
            ${true}     | ${false}     | ${'debitAmount without interval'}
            ${false}    | ${false}     | ${'receiveAmount without interval'}
          `(
            'fails if grant limit $description is not enough for payment',
            async ({ debitAmount, withInterval }): Promise<void> => {
              const amount = {
                value: BigInt(12),
                assetCode: debitAmount
                  ? quote.asset.code
                  : quote.receiveAmount.assetCode,
                assetScale: debitAmount
                  ? quote.asset.scale
                  : quote.receiveAmount.assetScale
              }
              assert.ok(grant)
              const limits: Grant['limits'] = debitAmount
                ? { debitAmount: amount }
                : { receiveAmount: amount }

              if (withInterval) {
                limits.interval = interval
              }

              grant.limits = limits
              await expect(
                outgoingPaymentService.create({ ...options, grant })
              ).resolves.toEqual(OutgoingPaymentError.InsufficientGrant)
            }
          )
          test.each`
            debitAmount | failed   | withInterval | description
            ${true}     | ${false} | ${true}      | ${'debitAmount with interval'}
            ${false}    | ${false} | ${true}      | ${'receiveAmount with interval'}
            ${true}     | ${true}  | ${true}      | ${'debitAmount, failed first payment with interval'}
            ${false}    | ${true}  | ${true}      | ${'receiveAmount, failed first payment with interval'}
            ${true}     | ${false} | ${false}     | ${'debitAmount without interval'}
            ${false}    | ${false} | ${false}     | ${'receiveAmount without interval'}
            ${true}     | ${true}  | ${false}     | ${'debitAmount, failed first payment without interval'}
            ${false}    | ${true}  | ${false}     | ${'receiveAmount, failed first payment without interval'}
          `(
            'fails if limit was already used up - $description',
            async ({ debitAmount, failed, withInterval }): Promise<void> => {
              const grantAmount = {
                value: BigInt(200),
                assetCode: debitAmount
                  ? quote.asset.code
                  : quote.receiveAmount.assetCode,
                assetScale: debitAmount
                  ? quote.asset.scale
                  : quote.receiveAmount.assetScale
              }

              assert.ok(grant)

              const grantLimits: Grant['limits'] = debitAmount
                ? { debitAmount: grantAmount }
                : { receiveAmount: grantAmount }

              if (withInterval) {
                grantLimits.interval = interval
              }

              grant.limits = grantLimits

              const paymentAmount = {
                ...grantAmount,
                value: BigInt(190)
              }

              const firstPayment = await createOutgoingPayment(deps, {
                walletAddressId,
                client,
                receiver: `${Config.openPaymentsUrl}/incoming-payments/${uuid()}`,
                debitAmount: debitAmount ? paymentAmount : undefined,
                receiveAmount: debitAmount ? undefined : paymentAmount,
                grant,
                validDestination: false,
                method: 'ilp'
              })

              assert.ok(firstPayment)

              if (failed) {
                await firstPayment
                  .$query(knex)
                  .patch({ state: OutgoingPaymentState.Failed })

                jest
                  .spyOn(accountingService, 'getTotalSent')
                  .mockResolvedValueOnce(
                    debitAmount ? BigInt(188) : BigInt(188 * 2)
                  )
              }

              await expect(
                outgoingPaymentService.create({ ...options, grant })
              ).resolves.toEqual(OutgoingPaymentError.InsufficientGrant)
            }
          )
          test.each`
            limits          | description
            ${undefined}    | ${'has no limits'}
            ${{ receiver }} | ${'limits do not specify send or receive amount'}
          `(
            'succeeds if grant access $description',
            async ({ limits }): Promise<void> => {
              assert.ok(grant)
              grant.limits = limits
              await expect(
                outgoingPaymentService.create({ ...options, grant })
              ).resolves.toBeInstanceOf(OutgoingPayment)
            }
          )

          test.each`
            debitAmount | competingPayment | failed       | half     | withInterval | description
            ${true}     | ${false}         | ${undefined} | ${false} | ${true}      | ${'debitAmount w/o competing payment with interval'}
            ${false}    | ${false}         | ${undefined} | ${false} | ${true}      | ${'receiveAmount w/o competing payment with interval'}
            ${true}     | ${true}          | ${false}     | ${false} | ${true}      | ${'debitAmount w/ competing payment with interval'}
            ${false}    | ${true}          | ${false}     | ${false} | ${true}      | ${'receiveAmount w/ competing payment with interval'}
            ${true}     | ${true}          | ${true}      | ${false} | ${true}      | ${'debitAmount w/ failed competing payment with interval'}
            ${false}    | ${true}          | ${true}      | ${false} | ${true}      | ${'receiveAmount w/ failed competing payment with interval'}
            ${true}     | ${true}          | ${true}      | ${true}  | ${true}      | ${'debitAmount w/ half-way failed competing payment with interval'}
            ${false}    | ${true}          | ${true}      | ${true}  | ${true}      | ${'receiveAmount half-way w/ failed competing payment with interval'}
            ${true}     | ${false}         | ${undefined} | ${false} | ${false}     | ${'debitAmount w/o competing payment without interval'}
            ${false}    | ${false}         | ${undefined} | ${false} | ${false}     | ${'receiveAmount w/o competing payment without interval'}
            ${true}     | ${true}          | ${false}     | ${false} | ${false}     | ${'debitAmount w/ competing payment without interval'}
            ${false}    | ${true}          | ${false}     | ${false} | ${false}     | ${'receiveAmount w/ competing payment without interval'}
            ${true}     | ${true}          | ${true}      | ${false} | ${false}     | ${'debitAmount w/ failed competing payment without interval'}
            ${false}    | ${true}          | ${true}      | ${false} | ${false}     | ${'receiveAmount w/ failed competing payment without interval'}
            ${true}     | ${true}          | ${true}      | ${true}  | ${false}     | ${'debitAmount w/ half-way failed competing payment without interval'}
            ${false}    | ${true}          | ${true}      | ${true}  | ${false}     | ${'receiveAmount half-way w/ failed competing payment without interval'}
          `(
            'succeeds if grant limit is enough for payment - $description',
            async ({
              debitAmount,
              competingPayment,
              failed,
              half,
              withInterval
            }): Promise<void> => {
              const grantAmount = {
                value: BigInt(1234567),
                assetCode: debitAmount
                  ? quote.asset.code
                  : quote.receiveAmount.assetCode,
                assetScale: debitAmount
                  ? quote.asset.scale
                  : quote.receiveAmount.assetScale
              }

              assert.ok(grant)

              const limits: Grant['limits'] = debitAmount
                ? { debitAmount: grantAmount }
                : { receiveAmount: grantAmount }

              if (withInterval) {
                limits.interval = interval
              }

              grant.limits = limits

              if (competingPayment) {
                const paymentAmount = {
                  ...grantAmount,
                  value: BigInt(7)
                }

                const firstPayment = await createOutgoingPayment(deps, {
                  walletAddressId,
                  client,
                  receiver: `${Config.openPaymentsUrl}/incoming-payments/${uuid()}`,
                  debitAmount: debitAmount ? paymentAmount : undefined,
                  receiveAmount: debitAmount ? undefined : paymentAmount,
                  grant,
                  validDestination: false,
                  method: 'ilp'
                })

                assert.ok(firstPayment)

                if (failed) {
                  await firstPayment
                    .$query(knex)
                    .patch({ state: OutgoingPaymentState.Failed })

                  if (half) {
                    jest
                      .spyOn(accountingService, 'getTotalSent')
                      .mockResolvedValueOnce(BigInt(100))
                  }
                }
              }

              await expect(
                outgoingPaymentService.create({ ...options, grant })
              ).resolves.toBeInstanceOf(OutgoingPayment)
            }
          )
        })
      }
    })

    describe('legacy grant spent amounts calculated from history of payments', (): void => {
      let grant: Grant
      let client: string

      beforeEach(async (): Promise<void> => {
        // setup existing grant
        grant = {
          id: uuid()
        }
        client = faker.internet.url({ appendSlash: false })
        await OutgoingPaymentGrant.query(knex).insertAndFetch({
          id: grant.id
        })
      })

      test('without interval', async (): Promise<void> => {
        // amount limit only, no interval
        grant.limits = {
          debitAmount: {
            value: BigInt(1000),
            assetCode: 'USD',
            assetScale: 9
          }
        }

        const legacyPayment1Amount = BigInt(100)
        const legacyPayment2Amount = BigInt(150)
        const newPaymentAmount = BigInt(200)

        await createOutgoingPayment(deps, {
          walletAddressId,
          client,
          receiver: `${Config.openPaymentsUrl}/incoming-payments/${uuid()}`,
          debitAmount: {
            value: legacyPayment1Amount,
            assetCode: 'USD',
            assetScale: 9
          },
          grant,
          validDestination: false,
          method: 'ilp'
        })
        await createOutgoingPayment(deps, {
          walletAddressId,
          client,
          receiver: `${Config.openPaymentsUrl}/incoming-payments/${uuid()}`,
          debitAmount: {
            value: legacyPayment2Amount,
            assetCode: 'USD',
            assetScale: 9
          },
          grant,
          validDestination: false,
          method: 'ilp'
        })

        // remove spent amounts records to simulate a grant that existed before
        // tracking spent amounts via OutgoingPaymentGrantSpentAmounts
        await OutgoingPaymentGrantSpentAmounts.query(knex)
          .where('grantId', grant.id)
          .delete()

        const quote = await createQuote(deps, {
          walletAddressId,
          receiver,
          debitAmount: {
            value: newPaymentAmount,
            assetCode: 'USD',
            assetScale: 9
          },
          method: 'ilp'
        })
        const payment = await outgoingPaymentService.create({
          walletAddressId,
          client,
          quoteId: quote.id,
          grant
        })
        assert.ok(!isOutgoingPaymentError(payment))

        expect(payment.grantSpentDebitAmount?.value).toBe(
          legacyPayment1Amount + legacyPayment2Amount
        )
        const spentAmounts = await OutgoingPaymentGrantSpentAmounts.query(knex)
          .where({ outgoingPaymentId: payment.id })
          .first()
        assert(spentAmounts)
        expect(spentAmounts).toEqual(
          expect.objectContaining({
            grantId: grant.id,
            outgoingPaymentId: payment.id,
            grantTotalDebitAmountValue:
              legacyPayment1Amount + legacyPayment2Amount + newPaymentAmount,
            intervalDebitAmountValue: null,
            intervalReceiveAmountValue: null,
            intervalStart: null,
            intervalEnd: null,
            paymentState: 'FUNDING'
          })
        )
      })

      test('with interval', async (): Promise<void> => {
        const start = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) // 5 days ago
        const interval = `R0/${start.toISOString()}/P1M`

        // with amount and interval limits
        grant.limits = {
          debitAmount: {
            value: BigInt(1000),
            assetCode: 'USD',
            assetScale: 9
          },
          interval
        }

        const legacyPaymentInIntervalAmount = BigInt(100)
        const legacyPaymentBeforeIntervalAmount = BigInt(75)
        const newPaymentAmount = BigInt(200)

        // legacy payment in interval
        await createOutgoingPayment(deps, {
          walletAddressId,
          client,
          receiver: `${Config.openPaymentsUrl}/incoming-payments/${uuid()}`,
          debitAmount: {
            value: legacyPaymentInIntervalAmount,
            assetCode: 'USD',
            assetScale: 9
          },
          grant,
          validDestination: false,
          method: 'ilp'
        })
        const legacyPaymentBeforeInterval = await createOutgoingPayment(deps, {
          walletAddressId,
          client,
          receiver: `${Config.openPaymentsUrl}/incoming-payments/${uuid()}`,
          debitAmount: {
            value: legacyPaymentBeforeIntervalAmount,
            assetCode: 'USD',
            assetScale: 9
          },
          grant,
          validDestination: false,
          method: 'ilp'
        })

        // manually set to be outside interval
        const oldDate = new Date(start.getTime() - 50 * 24 * 60 * 60 * 1000) // 50 days before interval start
        await legacyPaymentBeforeInterval
          .$query(knex)
          .patch({ createdAt: oldDate })

        // remove spent amounts records to simulate a grant that existed before
        // tracking spent amounts via OutgoingPaymentGrantSpentAmounts
        await OutgoingPaymentGrantSpentAmounts.query(knex)
          .where('grantId', grant.id)
          .delete()

        const quote = await createQuote(deps, {
          walletAddressId,
          receiver,
          debitAmount: {
            value: newPaymentAmount,
            assetCode: 'USD',
            assetScale: 9
          },
          method: 'ilp'
        })
        const payment = await outgoingPaymentService.create({
          walletAddressId,
          client,
          quoteId: quote.id,
          grant
        })

        assert.ok(!isOutgoingPaymentError(payment))

        // should not include out of interval payment
        expect(payment.grantSpentDebitAmount?.value).toBe(
          legacyPaymentInIntervalAmount
        )

        const spentAmounts = await OutgoingPaymentGrantSpentAmounts.query(knex)
          .where({ outgoingPaymentId: payment.id })
          .first()
        assert(spentAmounts)
        expect(spentAmounts).toEqual(
          expect.objectContaining({
            grantId: grant.id,
            outgoingPaymentId: payment.id,
            // all legacy payments and new payment
            grantTotalDebitAmountValue:
              legacyPaymentInIntervalAmount +
              legacyPaymentBeforeIntervalAmount +
              newPaymentAmount,
            // all legacy payments and new payments in current interval
            intervalDebitAmountValue:
              legacyPaymentInIntervalAmount + newPaymentAmount,
            intervalStart: expect.any(Date),
            intervalEnd: expect.any(Date),
            paymentState: 'FUNDING'
          })
        )
      })

      test('with failed payments - correctly handles partially sent amounts', async (): Promise<void> => {
        grant.limits = {
          debitAmount: {
            value: BigInt(1000),
            assetCode: 'USD',
            assetScale: 9
          }
        }

        const successfulPaymentAmount = BigInt(100)
        const failedPaymentRequestedAmount = BigInt(200)
        const failedPaymentActualSentAmount = BigInt(150)
        const newPaymentAmount = BigInt(50)

        // successful payment
        await createOutgoingPayment(deps, {
          walletAddressId,
          client,
          receiver: `${Config.openPaymentsUrl}/incoming-payments/${uuid()}`,
          debitAmount: {
            value: successfulPaymentAmount,
            assetCode: 'USD',
            assetScale: 9
          },
          grant,
          validDestination: false,
          method: 'ilp'
        })

        const failedPayment = await createOutgoingPayment(deps, {
          walletAddressId,
          client,
          receiver: `${Config.openPaymentsUrl}/incoming-payments/${uuid()}`,
          debitAmount: {
            value: failedPaymentRequestedAmount,
            assetCode: 'USD',
            assetScale: 9
          },
          grant,
          validDestination: false,
          method: 'ilp'
        })
        await failedPayment.$query(knex).patch({
          state: OutgoingPaymentState.Failed
        })

        // return partial amount for failed payment
        const mockGetTotalSent = jest.spyOn(accountingService, 'getTotalSent')
        mockGetTotalSent.mockResolvedValueOnce(failedPaymentActualSentAmount)

        // remove spent amounts records to simulate a grant that existed before
        // tracking spent amounts via OutgoingPaymentGrantSpentAmounts
        await OutgoingPaymentGrantSpentAmounts.query(knex)
          .where('grantId', grant.id)
          .delete()

        const quote = await createQuote(deps, {
          walletAddressId,
          receiver,
          debitAmount: {
            value: newPaymentAmount,
            assetCode: 'USD',
            assetScale: 9
          },
          method: 'ilp'
        })

        const payment = await outgoingPaymentService.create({
          walletAddressId,
          client,
          quoteId: quote.id,
          grant
        })

        assert.ok(!isOutgoingPaymentError(payment))

        const expectedTotalSpent =
          successfulPaymentAmount + failedPaymentActualSentAmount
        const expectedGrantTotal = expectedTotalSpent + newPaymentAmount

        expect(payment.grantSpentDebitAmount?.value).toBe(expectedTotalSpent)

        const spentAmounts = await OutgoingPaymentGrantSpentAmounts.query(knex)
          .where({ outgoingPaymentId: payment.id })
          .first()

        assert(spentAmounts)
        expect(spentAmounts.grantTotalDebitAmountValue).toBe(expectedGrantTotal)
        expect(mockGetTotalSent).toHaveBeenCalledWith(failedPayment.id)
      })

      test('with failed payment that sent nothing - excludes from spent amounts', async (): Promise<void> => {
        grant.limits = {
          debitAmount: {
            value: BigInt(1000),
            assetCode: 'USD',
            assetScale: 9
          }
        }

        const failedPayment = await createOutgoingPayment(deps, {
          walletAddressId,
          client,
          receiver: `${Config.openPaymentsUrl}/incoming-payments/${uuid()}`,
          debitAmount: {
            value: BigInt(200),
            assetCode: 'USD',
            assetScale: 9
          },
          grant,
          validDestination: false,
          method: 'ilp'
        })

        await failedPayment.$query(knex).patch({
          state: OutgoingPaymentState.Failed
        })

        const mockGetTotalSent = jest.spyOn(accountingService, 'getTotalSent')
        mockGetTotalSent.mockResolvedValueOnce(BigInt(0))

        // remove spent amounts records to simulate a grant that existed before
        // tracking spent amounts via OutgoingPaymentGrantSpentAmounts
        await OutgoingPaymentGrantSpentAmounts.query(knex)
          .where('grantId', grant.id)
          .delete()

        const quote = await createQuote(deps, {
          walletAddressId,
          receiver,
          debitAmount: {
            value: BigInt(50),
            assetCode: 'USD',
            assetScale: 9
          },
          method: 'ilp'
        })

        const payment = await outgoingPaymentService.create({
          walletAddressId,
          client,
          quoteId: quote.id,
          grant
        })

        assert.ok(!isOutgoingPaymentError(payment))

        // failed payment should have sent nothing
        expect(payment.grantSpentDebitAmount?.value).toBe(BigInt(0))
        expect(mockGetTotalSent).toHaveBeenCalledWith(failedPayment.id)
      })
    })
  })

  describe('processNext', (): void => {
    const receiveAmount = {
      value: BigInt(123),
      assetCode: destinationAsset.code,
      assetScale: destinationAsset.scale
    }

    async function setup(
      opts: Omit<CreateQuoteOptions, 'walletAddressId'>,
      incomingAmount?: Amount
    ): Promise<OutgoingPayment> {
      if (incomingAmount) {
        await incomingPayment.$query(knex).patch({ incomingAmount })
      }
      const payment = await createOutgoingPayment(deps, {
        walletAddressId,
        client,
        ...opts
      })

      await expect(
        outgoingPaymentService.fund({
          id: payment.id,
          amount: payment.debitAmount.value,
          transferId: uuid()
        })
      ).resolves.toMatchObject({
        state: OutgoingPaymentState.Sending
      })

      return payment
    }

    test('Telemetry Transaction Counter increments for COMPLETED transactions', async (): Promise<void> => {
      const incrementTrxCounterSpy = jest
        .spyOn(telemetryService!, 'incrementCounter')
        .mockImplementation(() => Promise.resolve())

      incomingPayment = await createIncomingPayment(deps, {
        walletAddressId: receiverWalletAddress.id,
        incomingAmount: {
          value: receiveAmount.value,
          assetCode: receiverWalletAddress.asset.code,
          assetScale: receiverWalletAddress.asset.scale
        }
      })
      assert.ok(incomingPayment.walletAddress)

      const createdPayment = await setup({
        receiver: incomingPayment.getUrl(config.openPaymentsUrl),
        receiveAmount,
        method: 'ilp'
      })

      mockPaymentHandlerPay(createdPayment, incomingPayment)
      const payment = await processNext(
        createdPayment.id,
        OutgoingPaymentState.Completed
      )
      await expectOutcome(payment, {
        accountBalance: 0n,
        amountSent: payment.debitAmount.value,
        amountDelivered: payment.receiveAmount.value,
        incomingPaymentReceived: payment.receiveAmount.value,
        withdrawAmount: 0n
      })

      expect(incrementTrxCounterSpy).toHaveBeenCalledWith(
        'transactions_total',
        1,
        {
          description: 'Count of funded transactions'
        }
      )
    })

    test('Telemetry Transaction Counter does not increments for FAILED transactions', async (): Promise<void> => {
      const incrementTrxCounterSpy = jest
        .spyOn(telemetryService!, 'incrementCounter')
        .mockImplementation(() => Promise.resolve())
      const createdPayment = await setup({
        receiver,
        debitAmount,
        method: 'ilp'
      })

      mockPaymentHandlerPay(
        createdPayment,
        incomingPayment,
        new PaymentMethodHandlerError('Failed payment', {
          description: '',
          retryable: false
        })
      )

      const payment = await processNext(
        createdPayment.id,
        OutgoingPaymentState.Failed,
        'Failed payment'
      )

      await expectOutcome(payment, {
        accountBalance: payment.debitAmount.value,
        amountSent: 0n,
        amountDelivered: 0n,
        incomingPaymentReceived: incomingPayment.receivedAmount.value,
        withdrawAmount: 0n
      })

      expect(incrementTrxCounterSpy).not.toHaveBeenCalled()
    })

    test('COMPLETED with Telemetry Fee Counter (receiveAmount < incomingPayment.incomingAmount)', async (): Promise<void> => {
      const spyTelFeeAmount = jest.spyOn(
        telemetryService,
        'incrementCounterWithTransactionAmountDifference'
      )
      const spyCounter = jest.spyOn(telemetryService, 'incrementCounter')

      incomingPayment = await createIncomingPayment(deps, {
        walletAddressId: receiverWalletAddress.id,
        incomingAmount: {
          value: receiveAmount.value * 2n,
          assetCode: receiverWalletAddress.asset.code,
          assetScale: receiverWalletAddress.asset.scale
        }
      })
      assert.ok(incomingPayment.walletAddress)

      const createdPayment = await setup({
        receiver: incomingPayment.getUrl(config.openPaymentsUrl),
        receiveAmount,
        method: 'ilp'
      })

      mockPaymentHandlerPay(createdPayment, incomingPayment)
      const payment = await processNext(
        createdPayment.id,
        OutgoingPaymentState.Completed
      )
      await expectOutcome(payment, {
        accountBalance: 0n,
        amountSent: payment.debitAmount.value,
        amountDelivered: payment.receiveAmount.value,
        incomingPaymentReceived: payment.receiveAmount.value,
        withdrawAmount: 0n
      })
      // [incrementCounterWithTransactionAmountDifference] called and [incrementCounter] only once due to [Count of funded transactions]
      expect(spyTelFeeAmount).toHaveBeenCalledTimes(1)
      expect(spyCounter).toHaveBeenCalledTimes(1)
      expect(spyCounter).toHaveBeenCalledTimes(1)
    })

    test.each`
      debitAmount    | receiveAmount
      ${debitAmount} | ${undefined}
      ${undefined}   | ${receiveAmount}
    `('COMPLETED', async ({ debitAmount, receiveAmount }): Promise<void> => {
      const spyTelFeeAmount = jest.spyOn(
        telemetryService,
        'incrementCounterWithTransactionAmountDifference'
      )
      const spyCounter = jest.spyOn(telemetryService, 'incrementCounter')

      const createdPayment = await setup({
        receiver,
        debitAmount,
        receiveAmount,
        method: 'ilp'
      })

      mockPaymentHandlerPay(createdPayment, incomingPayment)

      const payment = await processNext(
        createdPayment.id,
        OutgoingPaymentState.Completed
      )
      await expectOutcome(payment, {
        accountBalance: 0n,
        amountSent: payment.debitAmount.value,
        amountDelivered: payment.receiveAmount.value,
        incomingPaymentReceived: payment.receiveAmount.value,
        withdrawAmount: 0n
      })
      expect(spyTelFeeAmount).toHaveBeenCalledTimes(1)
      expect(spyCounter).toHaveBeenCalledTimes(1)
    })

    test('COMPLETED (receiveAmount < incomingPayment.incomingAmount)', async (): Promise<void> => {
      incomingPayment = await createIncomingPayment(deps, {
        walletAddressId: receiverWalletAddress.id,
        incomingAmount: {
          value: receiveAmount.value * 2n,
          assetCode: receiverWalletAddress.asset.code,
          assetScale: receiverWalletAddress.asset.scale
        }
      })
      assert.ok(incomingPayment.id)
      assert.ok(incomingPayment.createdAt)
      assert.ok(incomingPayment.updatedAt)
      assert.ok(incomingPayment.expiresAt)
      assert.ok(incomingPayment.processAt)
      assert.ok(incomingPayment.assetId)
      assert.ok(incomingPayment.asset)
      assert.ok(incomingPayment.asset.code)
      assert.ok(incomingPayment.asset.scale)
      assert.ok(incomingPayment.asset.createdAt)
      assert.ok(incomingPayment.walletAddressId)
      assert.ok(incomingPayment.walletAddress)
      expect(incomingPayment.state).toEqual('PENDING')
      expect(incomingPayment.incomingAmount?.value).toBeGreaterThan(0n)
      assert.ok(incomingPayment.incomingAmount?.assetCode)
      assert.ok(incomingPayment.incomingAmount?.assetScale)
      expect(incomingPayment.receivedAmount.value).toEqual(0n)
      assert.ok(incomingPayment.receivedAmount?.assetCode)
      assert.ok(incomingPayment.receivedAmount?.assetScale)

      const createdPayment = await setup({
        receiver: incomingPayment.getUrl(config.openPaymentsUrl),
        receiveAmount,
        method: 'ilp'
      })

      mockPaymentHandlerPay(createdPayment, incomingPayment)
      const payment = await processNext(
        createdPayment.id,
        OutgoingPaymentState.Completed
      )
      await expectOutcome(payment, {
        accountBalance: 0n,
        amountSent: payment.debitAmount.value,
        amountDelivered: payment.receiveAmount.value,
        incomingPaymentReceived: payment.receiveAmount.value,
        withdrawAmount: 0n
      })
    })

    test('COMPLETED (with incoming payment initially partially paid)', async (): Promise<void> => {
      const createdPayment = await setup(
        {
          receiver,
          receiveAmount,
          method: 'ilp'
        },
        receiveAmount
      )

      const amountAlreadyDelivered = BigInt(34)
      await payIncomingPayment(amountAlreadyDelivered)

      mockPaymentHandlerPay(createdPayment, incomingPayment)

      const payment = await processNext(
        createdPayment.id,
        OutgoingPaymentState.Completed
      )
      // The amountAlreadyDelivered is unknown to the sender when sending to
      // the connection (instead of the incoming payment), so the entire
      // receive amount is delivered by the outgoing payment ("overpaying"
      // the incoming payment).
      // Incoming payments allow overpayment (above the incomingAmount) for
      // one packet. In this case, the full payment amount was completed in a
      // single packet. With a different combination of amounts and
      // maxPacketAmount limits, an outgoing payment to a connection could
      // overpay the corresponding incoming payment's incomingAmount without
      // the full outgoing payment receive amount being delivered.
      await expectOutcome(payment, {
        accountBalance: 0n,
        amountSent: payment.debitAmount.value,
        amountDelivered: payment.receiveAmount.value - amountAlreadyDelivered,
        incomingPaymentReceived: payment.receiveAmount.value,
        withdrawAmount: 0n
      })
    })

    test('SENDING -> FAILED (partial payment then retryable Pay error)', async (): Promise<void> => {
      const createdPayment = await setup({
        receiver,
        debitAmount,
        method: 'ilp'
      })

      await makeTransfer({
        incomingPayment,
        receiveAmount: 5n,
        outgoingPayment: createdPayment,
        debitAmount: 10n
      })

      const retryableError = new PaymentMethodHandlerError('Failed payment', {
        description: '',
        retryable: true
      })

      for (let i = 0; i < 4; i++) {
        mockPaymentHandlerPay(createdPayment, incomingPayment, retryableError)

        const payment = await processNext(
          createdPayment.id,
          OutgoingPaymentState.Sending
        )
        expect(payment.stateAttempts).toBe(i + 1)
        // Skip through the backoff timer.
        fastForwardToAttempt(payment.stateAttempts)
      }

      mockPaymentHandlerPay(createdPayment, incomingPayment, retryableError)

      // Last attempt fails, but no more retries.
      const payment = await processNext(
        createdPayment.id,
        OutgoingPaymentState.Failed,
        retryableError.message
      )

      expect(payment.stateAttempts).toBe(0)
      await expectOutcome(payment, {
        accountBalance: payment.debitAmount.value - 10n,
        amountSent: 10n,
        amountDelivered: 5n,
        incomingPaymentReceived: 5n,
        withdrawAmount: payment.debitAmount.value - 10n
      })
    })

    test('FAILED (non-retryable error)', async (): Promise<void> => {
      const createdPayment = await setup({
        receiver,
        debitAmount,
        method: 'ilp'
      })

      mockPaymentHandlerPay(
        createdPayment,
        incomingPayment,
        new PaymentMethodHandlerError('Failed payment', {
          description: '',
          retryable: false
        })
      )

      const payment = await processNext(
        createdPayment.id,
        OutgoingPaymentState.Failed,
        'Failed payment'
      )

      await expectOutcome(payment, {
        accountBalance: payment.debitAmount.value,
        amountSent: 0n,
        amountDelivered: 0n,
        incomingPaymentReceived: incomingPayment.receivedAmount.value,
        withdrawAmount: 0n
      })
    })

    test('SENDING→COMPLETED (partial payment, resume, complete)', async (): Promise<void> => {
      const createdPayment = await setup({
        receiver,
        receiveAmount,
        method: 'ilp'
      })

      await makeTransfer({
        incomingPayment,
        receiveAmount: 5n,
        outgoingPayment: createdPayment,
        debitAmount: 10n
      })

      mockPaymentHandlerPay(createdPayment, incomingPayment)

      const payment = await processNext(
        createdPayment.id,
        OutgoingPaymentState.Completed
      )

      await expectOutcome(payment, {
        accountBalance: 0n,
        amountSent: payment.debitAmount.value,
        amountDelivered: payment.receiveAmount.value,
        incomingPaymentReceived: payment.receiveAmount.value
      })
    })

    // Caused by retry after failed SENDING→COMPLETED transition commit.
    test('COMPLETED (already fully paid)', async (): Promise<void> => {
      const createdPayment = await setup(
        {
          receiver,
          receiveAmount,
          method: 'ilp'
        },
        receiveAmount
      )

      mockPaymentHandlerPay(createdPayment, incomingPayment)

      await processNext(createdPayment.id, OutgoingPaymentState.Completed)
      // Pretend that the transaction didn't commit.
      await OutgoingPayment.query(knex)
        .findById(createdPayment.id)
        .patch({ state: OutgoingPaymentState.Sending })

      mockPaymentHandlerPay(createdPayment, incomingPayment)
      const payment = await processNext(
        createdPayment.id,
        OutgoingPaymentState.Completed
      )
      await expectOutcome(payment, {
        accountBalance: 0n,
        amountSent: payment.debitAmount.value,
        amountDelivered: payment.receiveAmount.value,
        incomingPaymentReceived: payment.receiveAmount.value
      })
    })

    test('COMPLETED (already fully paid)', async (): Promise<void> => {
      const { id: paymentId } = await setup(
        {
          receiver,
          receiveAmount,
          method: 'ilp'
        },
        receiveAmount
      )
      // The quote thinks there's a full amount to pay, but actually sending will find the incoming payment has been paid (e.g. by another payment).
      await payIncomingPayment(receiveAmount.value)

      const payment = await processNext(
        paymentId,
        OutgoingPaymentState.Completed
      )
      await expectOutcome(payment, {
        accountBalance: payment.debitAmount.value,
        amountSent: BigInt(0),
        amountDelivered: BigInt(0),
        incomingPaymentReceived: receiveAmount.value,
        withdrawAmount: payment.debitAmount.value
      })
    })

    test('FAILED (source asset changed)', async (): Promise<void> => {
      const { id: paymentId } = await setup(
        {
          receiver,
          receiveAmount,
          method: 'ilp'
        },
        receiveAmount
      )

      const { id: assetId } = await createAsset(deps, {
        code: asset.code,
        scale: asset.scale + 1
      })

      await OutgoingPayment.relatedQuery('walletAddress').for(paymentId).patch({
        assetId
      })

      await processNext(
        paymentId,
        OutgoingPaymentState.Failed,
        LifecycleError.SourceAssetConflict
      )
    })
    test('FAILED (destination asset changed)', async (): Promise<void> => {
      const createdPayment = await setup({
        receiver,
        debitAmount,
        method: 'ilp'
      })

      // Pretend that the destination asset was initially different.
      await OutgoingPayment.relatedQuery('quote')
        .for(createdPayment.id)
        .patch({
          receiveAmount: {
            ...receiveAmount,
            assetScale: 55
          }
        })
      await processNext(
        createdPayment.id,
        OutgoingPaymentState.Failed,
        LifecycleError.DestinationAssetConflict
      )
    })

    test('QuoteExpired (current time is greater than the payment quote expiration time)', async (): Promise<void> => {
      const createdPayment = await setup({
        receiver,
        debitAmount,
        method: 'ilp'
      })

      // Test case for `expiresAt` in the past (greater than current time)
      await createdPayment.quote.$query(knex).patch({
        expiresAt: new Date(Date.now() - 60 * 60 * 1000) // 1 hour ago
      })

      await processNext(
        createdPayment.id,
        OutgoingPaymentState.Failed,
        LifecycleError.QuoteExpired
      )
    })
  })

  describe('fund', (): void => {
    let payment: OutgoingPayment
    let quoteAmount: bigint

    beforeEach(async (): Promise<void> => {
      payment = await createOutgoingPayment(deps, {
        walletAddressId,
        receiver,
        debitAmount,
        validDestination: false,
        method: 'ilp',
        client
      })
      quoteAmount = payment.debitAmount.value
      await expectOutcome(payment, {
        accountBalance: BigInt(0),
        client
      })
    }, 10_000)

    it('fails when no payment exists', async (): Promise<void> => {
      await expect(
        outgoingPaymentService.fund({
          id: uuid(),
          amount: quoteAmount,
          transferId: uuid()
        })
      ).resolves.toEqual(FundingError.UnknownPayment)
    })

    it('transitions a Funding payment to Sending state', async (): Promise<void> => {
      await expect(
        outgoingPaymentService.fund({
          id: payment.id,
          amount: quoteAmount,
          transferId: uuid()
        })
      ).resolves.toMatchObject({
        id: payment.id,
        state: OutgoingPaymentState.Sending
      })

      const after = await outgoingPaymentService.get({
        id: payment.id
      })
      expect(after?.state).toBe(OutgoingPaymentState.Sending)
      await expectOutcome(payment, { accountBalance: quoteAmount })
    })

    it('fails for invalid funding amount', async (): Promise<void> => {
      await expect(
        outgoingPaymentService.fund({
          id: payment.id,
          amount: quoteAmount - BigInt(1),
          transferId: uuid()
        })
      ).resolves.toEqual(FundingError.InvalidAmount)

      const after = await outgoingPaymentService.get({
        id: payment.id
      })
      expect(after?.state).toBe(OutgoingPaymentState.Funding)
      await expectOutcome(payment, { accountBalance: BigInt(0) })
    })

    Object.values(OutgoingPaymentState).forEach((startState) => {
      if (startState === OutgoingPaymentState.Funding) return
      it(`does not fund a ${startState} payment`, async (): Promise<void> => {
        await payment.$query().patch({ state: startState })
        await expect(
          outgoingPaymentService.fund({
            id: payment.id,
            amount: quoteAmount,
            transferId: uuid()
          })
        ).resolves.toEqual(FundingError.WrongState)

        const after = await outgoingPaymentService.get({
          id: payment.id
        })
        expect(after?.state).toBe(startState)
      })
    })
  })
})
