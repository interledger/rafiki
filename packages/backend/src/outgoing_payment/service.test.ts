import nock from 'nock'
import Knex from 'knex'
import * as Pay from '@interledger/pay'
import { StreamServer, StreamCredentials } from '@interledger/stream-receiver'
import { v4 as uuid } from 'uuid'

import { OutgoingPaymentService } from './service'
import { createTestApp, TestContainer } from '../tests/app'
import { IAppConfig, Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'
import { AccountFactory } from '../tests/accountFactory'
import { truncateTable, truncateTables } from '../tests/tableManager'
import { OutgoingPayment, PaymentIntent, PaymentState } from './model'
import { MockPlugin } from './mock_plugin'
import { LifecycleError } from './lifecycle'
import { RETRY_BACKOFF_SECONDS } from './worker'
import { AccountService } from '../account/service'
import { RatesService } from '../rates/service'
import { LiquidityService } from '../liquidity/service'

describe('OutgoingPaymentService', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let outgoingPaymentService: OutgoingPaymentService
  let ratesService: RatesService
  let accountService: AccountService
  let liquidityService: LiquidityService
  let knex: Knex
  let sourceAccountId: string
  let assetId: string
  let credentials: StreamCredentials
  let invoice: Pay.Invoice
  let plugins: { [accountId: string]: MockPlugin } = {}
  let config: IAppConfig

  const streamServer = new StreamServer({
    serverSecret: Buffer.from(
      '61a55774643daa45bec703385ea6911dbaaaa9b4850b77884f2b8257eef05836',
      'hex'
    ),
    serverAddress: 'test.wallet'
  })

  async function processNext(
    paymentId: string,
    expectState?: PaymentState,
    expectedError?: string
  ): Promise<OutgoingPayment> {
    await expect(outgoingPaymentService.processNext()).resolves.toBe(paymentId)
    const payment = await outgoingPaymentService.get(paymentId)
    if (!payment) throw 'no payment'
    if (expectState) expect(payment.state).toBe(expectState)
    expect(payment.error).toEqual(expectedError || null)
    return payment
  }

  function mockPay(
    extendQuote: Partial<Pay.Quote>,
    error?: Pay.PaymentError
  ): jest.SpyInstance<Promise<Pay.PaymentProgress>, [options: Pay.PayOptions]> {
    const { pay } = Pay
    return jest
      .spyOn(Pay, 'pay')
      .mockImplementation(async (opts: Pay.PayOptions) => {
        const res = await pay({
          ...opts,
          quote: { ...opts.quote, ...extendQuote }
        })
        if (error) res.error = error
        return res
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

  async function fund(paymentId: string): Promise<void> {
    const payment = await outgoingPaymentService.get(paymentId)
    if (!payment) throw 'no payment'
    if (!payment.quote) throw 'no quote'
    await expect(
      liquidityService.add({
        account: payment.account,
        amount: payment.quote.maxSourceAmount
      })
    ).resolves.toBeUndefined()
  }

  async function withdraw(paymentId: string): Promise<void> {
    const payment = await outgoingPaymentService.get(paymentId)
    if (!payment) throw 'no payment'
    const balance = await accountService.getBalance(payment.accountId)
    if (balance === undefined) throw 'no balance'
    const withdrawalId = uuid()
    await expect(
      liquidityService.createWithdrawal({
        id: withdrawalId,
        account: payment.account,
        amount: balance
      })
    ).resolves.toBeUndefined()
    await expect(
      liquidityService.finalizeWithdrawal(withdrawalId)
    ).resolves.toBeUndefined()
  }

  async function expectOutcome(
    payment: OutgoingPayment,
    {
      amountSent,
      amountDelivered,
      accountBalance,
      invoiceReceived
    }: {
      amountSent?: bigint
      amountDelivered?: bigint
      accountBalance?: bigint
      invoiceReceived?: bigint
    }
  ) {
    if (amountSent !== undefined) {
      await expect(
        accountService.getTotalSent(payment.accountId)
      ).resolves.toBe(amountSent)
    }
    if (amountDelivered !== undefined) {
      expect(plugins[payment.accountId].totalReceived).toBe(amountDelivered)
    }
    if (accountBalance !== undefined) {
      await expect(
        accountService.getBalance(payment.accountId)
      ).resolves.toEqual(accountBalance)
    }
    if (invoiceReceived !== undefined) {
      expect(invoice.amountDelivered).toBe(invoiceReceived)
    }
  }

  beforeAll(
    async (): Promise<void> => {
      ratesService = {
        convert: () => {
          throw new Error('unimplemented')
        },
        prices: async () => ({
          USD: 1.0,
          XRP: 2.0
        })
      }
      deps = await initIocContainer(Config)
      appContainer = await createTestApp(deps)
      accountService = await deps.use('accountService')
      const accountFactory = new AccountFactory(accountService)
      const destinationAccount = await accountFactory.build({
        asset: {
          scale: 9,
          code: 'USD'
        }
      })
      assetId = destinationAccount.assetId
      deps.bind('makeIlpPlugin', async (_deps) => (accountId: string) =>
        (plugins[accountId] =
          plugins[accountId] ||
          new MockPlugin({
            streamServer,
            exchangeRate: 0.5,
            accountId,
            destinationAccountId: destinationAccount.id,
            accountService,
            invoice
          }))
      )
      deps.bind('ratesService', async (_deps) => ratesService)
      knex = await deps.use('knex')
      config = await deps.use('config')
    }
  )

  beforeEach(
    async (): Promise<void> => {
      credentials = streamServer.generateCredentials({
        asset: {
          code: 'XRP',
          scale: 9
        }
      })
      outgoingPaymentService = await deps.use('outgoingPaymentService')
      liquidityService = await deps.use('liquidityService')
      sourceAccountId = uuid()
      invoice = {
        invoiceUrl: 'http://wallet.example/bob/invoices/1',
        accountUrl: 'http://wallet.example/bob',
        amountToDeliver: BigInt(56),
        amountDelivered: BigInt(0),
        asset: { code: 'XRP', scale: 9 },
        description: 'description!',
        expiresAt: Date.now() + 60 * 1000
      }

      nock('http://wallet.example')
        .get('/paymentpointer/bob')
        .reply(200, {
          destination_account: credentials.ilpAddress,
          shared_secret: credentials.sharedSecret.toString('base64')
        })
        .persist()
        .get('/bob/invoices/1')
        .reply(200, () => ({
          id: invoice.invoiceUrl,
          account: invoice.accountUrl,
          amount: invoice.amountToDeliver.toString(),
          received: invoice.amountDelivered.toString(),
          assetCode: invoice.asset.code,
          assetScale: invoice.asset.scale,
          expiresAt: new Date(invoice.expiresAt).toISOString(),
          description: invoice.description,
          ilpAddress: credentials.ilpAddress,
          sharedSecret: credentials.sharedSecret.toString('base64')
        }))
        .persist()
      await knex.raw('TRUNCATE TABLE "outgoingPayments" RESTART IDENTITY')
    }
  )

  afterEach((): void => {
    nock.cleanAll()
    jest.useRealTimers()
    jest.restoreAllMocks()

    for (const plugin of Object.values(plugins)) {
      // Plugins must be cleaned up, otherwise ilp-plugin-http can leak http2 connections.
      expect(plugin.isConnected()).toBe(false)
    }
    plugins = {}
  })

  afterAll(
    async (): Promise<void> => {
      await appContainer.shutdown()
      await truncateTables(knex)
    }
  )

  describe('get', (): void => {
    it('returns undefined when no payment exists', async () => {
      await expect(outgoingPaymentService.get(uuid())).resolves.toBeUndefined()
    })
  })

  describe('create', (): void => {
    it('creates an OutgoingPayment (FixedSend)', async () => {
      const payment = await outgoingPaymentService.create({
        sourceAccountId,
        assetId,
        paymentPointer: 'http://wallet.example/paymentpointer/bob',
        amountToSend: BigInt(123),
        autoApprove: false
      })
      expect(payment.state).toEqual(PaymentState.Inactive)
      expect(payment.intent).toEqual({
        paymentPointer: 'http://wallet.example/paymentpointer/bob',
        amountToSend: BigInt(123),
        autoApprove: false
      })
      expect(payment.sourceAccountId).toBe(sourceAccountId)
      await expectOutcome(payment, { accountBalance: BigInt(0) })
      expect(payment.account.asset.code).toBe('USD')
      expect(payment.account.asset.scale).toBe(9)
      expect(payment.destinationAccount).toEqual({
        scale: 9,
        code: 'XRP',
        url: 'http://wallet.example/paymentpointer/bob'
      })

      const payment2 = await outgoingPaymentService.get(payment.id)
      if (!payment2) throw 'no payment'
      expect(payment2.id).toEqual(payment.id)
    })

    it('creates an OutgoingPayment (FixedDelivery)', async () => {
      const payment = await outgoingPaymentService.create({
        sourceAccountId,
        assetId,
        invoiceUrl: 'http://wallet.example/bob/invoices/1',
        autoApprove: false
      })
      expect(payment.state).toEqual(PaymentState.Inactive)
      expect(payment.intent).toEqual({
        invoiceUrl: 'http://wallet.example/bob/invoices/1',
        autoApprove: false
      })
      expect(payment.sourceAccountId).toBe(sourceAccountId)
      await expectOutcome(payment, { accountBalance: BigInt(0) })
      expect(payment.account.asset.code).toBe('USD')
      expect(payment.account.asset.scale).toBe(9)
      expect(payment.destinationAccount).toEqual({
        scale: invoice.asset.scale,
        code: invoice.asset.code,
        url: invoice.accountUrl
      })

      const payment2 = await outgoingPaymentService.get(payment.id)
      if (!payment2) throw 'no payment'
      expect(payment2.id).toEqual(payment.id)
    })

    it('fails to create with both invoice and paymentPointer', async () => {
      await expect(
        outgoingPaymentService.create({
          sourceAccountId,
          assetId,
          invoiceUrl: 'http://wallet.example/bob/invoices/1',
          paymentPointer: 'http://wallet.example/paymentpointer/bob',
          autoApprove: false
        })
      ).rejects.toThrow(
        'invoiceUrl and (paymentPointer,amountToSend) are mutually exclusive'
      )
    })

    it('fails to create with both invoice and amountToSend', async () => {
      await expect(
        outgoingPaymentService.create({
          sourceAccountId,
          assetId,
          invoiceUrl: 'http://wallet.example/bob/invoices/1',
          amountToSend: BigInt(123),
          autoApprove: false
        })
      ).rejects.toThrow(
        'invoiceUrl and (paymentPointer,amountToSend) are mutually exclusive'
      )
    })

    it('fails to create with nonexistent asset', async () => {
      await expect(
        outgoingPaymentService.create({
          sourceAccountId,
          assetId: uuid(),
          paymentPointer: 'http://wallet.example/paymentpointer/bob',
          amountToSend: BigInt(123),
          autoApprove: false
        })
      ).rejects.toThrow('unable to create account, err=UnknownAsset')
    })
  })

  describe('processNext', (): void => {
    describe('Inactive→', (): void => {
      it('Ready (FixedSend)', async (): Promise<void> => {
        const paymentId = (
          await outgoingPaymentService.create({
            sourceAccountId,
            assetId,
            paymentPointer: 'http://wallet.example/paymentpointer/bob',
            amountToSend: BigInt(123),
            autoApprove: false
          })
        ).id
        const payment = await processNext(paymentId, PaymentState.Ready)
        if (!payment.quote) throw 'no quote'

        expect(payment.quote.timestamp).toBeInstanceOf(Date)
        expect(
          payment.quote.activationDeadline.getTime() - Date.now()
        ).toBeGreaterThan(0)
        expect(
          payment.quote.activationDeadline.getTime() - Date.now()
        ).toBeLessThanOrEqual(config.quoteLifespan)
        expect(payment.quote.targetType).toBe(Pay.PaymentType.FixedSend)
        expect(payment.quote.minDeliveryAmount).toBe(
          BigInt(Math.ceil(123 * payment.quote.minExchangeRate.valueOf()))
        )
        expect(payment.quote.maxSourceAmount).toBe(BigInt(123))
        expect(payment.quote.maxPacketAmount).toBe(
          BigInt('9223372036854775807')
        )
        expect(payment.quote.minExchangeRate.valueOf()).toBe(
          0.5 * (1 - config.slippage)
        )
        expect(payment.quote.lowExchangeRateEstimate.valueOf()).toBe(0.5)
        expect(payment.quote.highExchangeRateEstimate.valueOf()).toBe(
          0.500000000001
        )
      })

      it('Ready (FixedDelivery)', async (): Promise<void> => {
        const paymentId = (
          await outgoingPaymentService.create({
            sourceAccountId,
            assetId,
            invoiceUrl: 'http://wallet.example/bob/invoices/1',
            autoApprove: false
          })
        ).id
        const payment = await processNext(paymentId, PaymentState.Ready)
        if (!payment.quote) throw 'no quote'

        expect(payment.quote.targetType).toBe(Pay.PaymentType.FixedDelivery)
        expect(payment.quote.minDeliveryAmount).toBe(BigInt(56))
        expect(payment.quote.maxSourceAmount).toBe(
          BigInt(Math.ceil(56 * 2 * (1 + config.slippage)))
        )
        expect(payment.quote.minExchangeRate.valueOf()).toBe(
          0.5 * (1 - config.slippage)
        )
        expect(payment.quote.lowExchangeRateEstimate.valueOf()).toBe(0.5)
        expect(payment.quote.highExchangeRateEstimate.valueOf()).toBe(
          0.500000000001
        )
      })

      it('Inactive (rate service error)', async (): Promise<void> => {
        const mockFn = jest
          .spyOn(ratesService, 'prices')
          .mockImplementation(() => Promise.reject(new Error('fail')))
        const paymentId = (
          await outgoingPaymentService.create({
            sourceAccountId,
            assetId,
            paymentPointer: 'http://wallet.example/paymentpointer/bob',
            amountToSend: BigInt(123),
            autoApprove: false
          })
        ).id
        const payment = await processNext(paymentId, PaymentState.Inactive)

        expect(payment.stateAttempts).toBe(1)
        expect(payment.quote).toBeUndefined()

        mockFn.mockRestore()
        // Fast forward to next attempt.
        // Only mock the time once (for getPendingPayment) since otherwise ilp/pay's startQuote will get confused.
        jest
          .spyOn(Date, 'now')
          .mockReturnValueOnce(Date.now() + 1 * RETRY_BACKOFF_SECONDS * 1000)

        const payment2 = await processNext(paymentId, PaymentState.Ready)
        expect(payment2.quote?.maxSourceAmount).toBe(BigInt(123))
      })

      // This mocks Inactive→Ready, but for it to trigger for real, it would go from Sending→Inactive(retry)→Ready (when the sending partially failed).
      it('Ready (FixedSend, 0<intent.amountToSend<amountSent)', async (): Promise<void> => {
        const payment = await outgoingPaymentService.create({
          sourceAccountId,
          assetId,
          paymentPointer: 'http://wallet.example/paymentpointer/bob',
          amountToSend: BigInt(123),
          autoApprove: false
        })
        jest
          .spyOn(accountService, 'getTotalSent')
          .mockImplementation(async (id: string) => {
            expect(id).toStrictEqual(payment.accountId)
            return BigInt(89)
          })
        const payment2 = await processNext(payment.id, PaymentState.Ready)
        expect(payment2.quote?.maxSourceAmount).toBe(BigInt(123 - 89))
      })

      // This mocks Inactive→Completed, but for it to trigger for real, it would go from Sending→Inactive(retry)→Completed (when the Sending→Completed transition failed to commit).
      it('Completed (FixedSend, intent.amountToSend===amountSent)', async (): Promise<void> => {
        const payment = await outgoingPaymentService.create({
          sourceAccountId,
          assetId,
          paymentPointer: 'http://wallet.example/paymentpointer/bob',
          amountToSend: BigInt(123),
          autoApprove: false
        })
        jest
          .spyOn(accountService, 'getTotalSent')
          .mockImplementation(async (id: string) => {
            expect(id).toStrictEqual(payment.accountId)
            return BigInt(123)
          })
        await processNext(payment.id, PaymentState.Completed)
      })

      // Maybe another person or payment paid the invoice already. Or it could be like the FixedSend case, where the Sending→Completed transition failed to commit, and this is a retry.
      it('Completed (FixedDelivery, invoice was already full paid)', async (): Promise<void> => {
        invoice.amountDelivered = invoice.amountToDeliver
        const paymentId = (
          await outgoingPaymentService.create({
            sourceAccountId,
            assetId,
            invoiceUrl: 'http://wallet.example/bob/invoices/1',
            autoApprove: false
          })
        ).id
        await processNext(paymentId, PaymentState.Completed)
      })

      it('Cancelled (destination asset changed)', async (): Promise<void> => {
        const originalPayment = await outgoingPaymentService.create({
          sourceAccountId,
          assetId,
          paymentPointer: 'http://wallet.example/paymentpointer/bob',
          amountToSend: BigInt(123),
          autoApprove: false
        })
        const paymentId = originalPayment.id
        // Pretend that the destination asset was initially different.
        await OutgoingPayment.query(knex)
          .findById(paymentId)
          .patch({
            destinationAccount: Object.assign(
              {},
              originalPayment.destinationAccount,
              {
                scale: 55
              }
            )
          })

        await processNext(
          paymentId,
          PaymentState.Cancelled,
          Pay.PaymentError.DestinationAssetConflict
        )
      })
    })

    describe('Ready→', (): void => {
      async function setup({
        autoApprove
      }: {
        autoApprove: boolean
      }): Promise<string> {
        const paymentId = (
          await outgoingPaymentService.create({
            sourceAccountId,
            assetId,
            paymentPointer: 'http://wallet.example/paymentpointer/bob',
            amountToSend: BigInt(123),
            autoApprove
          })
        ).id
        await processNext(paymentId, PaymentState.Ready)
        return paymentId
      }

      it('Cancelled (quote expired; autoApprove=false)', async (): Promise<void> => {
        const paymentId = await setup({ autoApprove: false })
        jest.useFakeTimers('modern')
        jest.advanceTimersByTime(config.quoteLifespan + 1)

        await processNext(
          paymentId,
          PaymentState.Cancelled,
          LifecycleError.QuoteExpired
        )
      })

      it('Ready (autoApprove=false)', async (): Promise<void> => {
        await setup({ autoApprove: false })
        // (no change)
        await expect(
          outgoingPaymentService.processNext()
        ).resolves.toBeUndefined()
      })

      it('Funding (autoApprove=true)', async (): Promise<void> => {
        const paymentId = await setup({ autoApprove: true })
        await processNext(paymentId, PaymentState.Funding)
      })
    })

    describe('Funding→', (): void => {
      let paymentId: string

      beforeEach(
        async (): Promise<void> => {
          paymentId = (
            await outgoingPaymentService.create({
              sourceAccountId,
              assetId,
              paymentPointer: 'http://wallet.example/paymentpointer/bob',
              amountToSend: BigInt(123),
              autoApprove: true
            })
          ).id
          await processNext(paymentId, PaymentState.Ready)
          await processNext(paymentId, PaymentState.Funding)
        }
      )

      it('Cancelled (quote expired)', async (): Promise<void> => {
        jest.useFakeTimers('modern')
        jest.advanceTimersByTime(config.quoteLifespan + 1)

        await processNext(
          paymentId,
          PaymentState.Cancelled,
          LifecycleError.QuoteExpired
        )
      })

      it('Funding (waiting for liquidity)', async (): Promise<void> => {
        await processNext(paymentId, PaymentState.Funding)
      })

      it('Sending (money is reserved)', async (): Promise<void> => {
        await fund(paymentId)
        const payment = await processNext(paymentId, PaymentState.Sending)
        if (!payment.quote) throw 'no quote'
        await expectOutcome(payment, {
          accountBalance: payment.quote.maxSourceAmount
        })
      })
    })

    describe('Sending→', (): void => {
      async function setup(
        opts: Pick<
          PaymentIntent,
          'amountToSend' | 'paymentPointer' | 'invoiceUrl'
        >
      ): Promise<string> {
        const paymentId = (
          await outgoingPaymentService.create({
            sourceAccountId,
            assetId,
            autoApprove: true,
            ...opts
          })
        ).id
        await processNext(paymentId, PaymentState.Ready)
        await processNext(paymentId, PaymentState.Funding)
        await fund(paymentId)
        await processNext(paymentId, PaymentState.Sending)
        return paymentId
      }

      it('Completed (FixedSend)', async (): Promise<void> => {
        const paymentId = await setup({
          paymentPointer: 'http://wallet.example/paymentpointer/bob',
          amountToSend: BigInt(123)
        })

        const payment = await processNext(paymentId, PaymentState.Completed)
        await expectOutcome(payment, {
          accountBalance: BigInt(0),
          amountSent: BigInt(123),
          amountDelivered: BigInt(Math.floor(123 / 2))
        })
      })

      it('Completed (FixedDelivery)', async (): Promise<void> => {
        const paymentId = await setup({
          invoiceUrl: 'http://wallet.example/bob/invoices/1'
        })

        const payment = await processNext(paymentId, PaymentState.Completed)
        if (!payment.quote) throw 'no quote'
        const amountSent = invoice.amountToDeliver * BigInt(2)
        await expectOutcome(payment, {
          accountBalance: payment.quote.maxSourceAmount - amountSent,
          amountSent,
          amountDelivered: invoice.amountToDeliver,
          invoiceReceived: invoice.amountToDeliver
        })
      })

      it('Completed (FixedDelivery, with invoice initially partially paid)', async (): Promise<void> => {
        const amountAlreadyDelivered = BigInt(34)
        invoice.amountDelivered = amountAlreadyDelivered
        const paymentId = await setup({
          invoiceUrl: 'http://wallet.example/bob/invoices/1'
        })

        const payment = await processNext(paymentId, PaymentState.Completed)
        if (!payment.quote) throw 'no quote'
        const amountSent =
          (invoice.amountToDeliver - amountAlreadyDelivered) * BigInt(2)
        await expectOutcome(payment, {
          accountBalance: payment.quote.maxSourceAmount - amountSent,
          amountSent,
          amountDelivered: invoice.amountToDeliver - amountAlreadyDelivered,
          invoiceReceived: invoice.amountToDeliver
        })
      })

      it('Sending (partial payment then retryable Pay error)', async (): Promise<void> => {
        mockPay(
          {
            maxSourceAmount: BigInt(10),
            minDeliveryAmount: BigInt(5)
          },
          Pay.PaymentError.ClosedByReceiver
        )

        const paymentId = await setup({
          paymentPointer: 'http://wallet.example/paymentpointer/bob',
          amountToSend: BigInt(123)
        })

        for (let i = 0; i < 4; i++) {
          const payment = await processNext(paymentId, PaymentState.Sending)
          expect(payment.stateAttempts).toBe(i + 1)
          await expectOutcome(payment, {
            amountSent: BigInt(10 * (i + 1)),
            amountDelivered: BigInt(5 * (i + 1))
          })
          // Skip through the backoff timer.
          fastForwardToAttempt(payment.stateAttempts)
        }
        // Last attempt fails, but no more retries.
        const payment = await processNext(
          paymentId,
          PaymentState.Cancelled,
          Pay.PaymentError.ClosedByReceiver
        )
        expect(payment.stateAttempts).toBe(0)
        // "mockPay" allows a small amount of money to be paid every attempt.
        await expectOutcome(payment, {
          accountBalance: BigInt(123 - 10 * 5),
          amountSent: BigInt(10 * 5),
          amountDelivered: BigInt(5 * 5)
        })
      })

      it('Cancelled (non-retryable Pay error)', async (): Promise<void> => {
        mockPay(
          {
            maxSourceAmount: BigInt(10),
            minDeliveryAmount: BigInt(5)
          },
          Pay.PaymentError.ReceiverProtocolViolation
        )
        const paymentId = await setup({
          paymentPointer: 'http://wallet.example/paymentpointer/bob',
          amountToSend: BigInt(123)
        })

        const payment = await processNext(
          paymentId,
          PaymentState.Cancelled,
          Pay.PaymentError.ReceiverProtocolViolation
        )
        await expectOutcome(payment, {
          accountBalance: BigInt(123 - 10),
          amountSent: BigInt(10),
          amountDelivered: BigInt(5)
        })
      })

      it('→Sending→Completed (partial payment, resume, complete)', async (): Promise<void> => {
        const mockFn = mockPay(
          {
            maxSourceAmount: BigInt(10),
            minDeliveryAmount: BigInt(5)
          },
          Pay.PaymentError.ClosedByReceiver
        )
        const amountToSend = BigInt(123)
        const paymentId = await setup({
          paymentPointer: 'http://wallet.example/paymentpointer/bob',
          amountToSend
        })

        const payment = await processNext(paymentId, PaymentState.Sending)
        mockFn.mockRestore()
        fastForwardToAttempt(1)
        await expectOutcome(payment, {
          accountBalance: BigInt(123 - 10),
          amountSent: BigInt(10),
          amountDelivered: BigInt(5)
        })

        // The next attempt is without the mock, so it succeeds.
        const payment2 = await processNext(paymentId, PaymentState.Completed)
        await expectOutcome(payment2, {
          accountBalance: BigInt(0),
          amountSent: amountToSend,
          amountDelivered: amountToSend / BigInt(2)
        })
      })

      // Caused by retry after failed Sending→Completed transition commit.
      it('Completed (FixedSend, already fully paid)', async (): Promise<void> => {
        const paymentId = await setup({
          paymentPointer: 'http://wallet.example/paymentpointer/bob',
          amountToSend: BigInt(123)
        })

        await processNext(paymentId, PaymentState.Completed)
        // Pretend that the transaction didn't commit.
        await OutgoingPayment.query(knex)
          .findById(paymentId)
          .patch({ state: PaymentState.Sending })
        const payment = await processNext(paymentId, PaymentState.Completed)
        await expectOutcome(payment, {
          accountBalance: BigInt(0),
          amountSent: BigInt(123),
          amountDelivered: BigInt(123) / BigInt(2)
        })
      })

      // Caused by retry after failed Sending→Completed transition commit.
      it('Completed (FixedDelivery, already fully paid)', async (): Promise<void> => {
        const paymentId = await setup({
          invoiceUrl: 'http://wallet.example/bob/invoices/1'
        })
        // The quote thinks there's a full amount to pay, but actually sending will find the invoice has been paid (e.g. by another payment).
        invoice.amountDelivered = invoice.amountToDeliver

        const payment = await processNext(paymentId, PaymentState.Completed)
        if (!payment.quote) throw 'no quote'
        await expectOutcome(payment, {
          accountBalance: payment.quote.maxSourceAmount,
          amountSent: BigInt(0),
          amountDelivered: BigInt(0),
          invoiceReceived: invoice.amountToDeliver
        })
      })

      it('Cancelled (destination asset changed)', async (): Promise<void> => {
        const paymentId = await setup({
          invoiceUrl: 'http://wallet.example/bob/invoices/1'
        })
        // Pretend that the destination asset was initially different.
        await OutgoingPayment.query(knex)
          .findById(paymentId)
          .patch({
            destinationAccount: {
              url: invoice.accountUrl,
              code: invoice.asset.code,
              scale: 55
            }
          })

        await processNext(
          paymentId,
          PaymentState.Cancelled,
          Pay.PaymentError.DestinationAssetConflict
        )
      })
    })

    describe.each([PaymentState.Cancelled, PaymentState.Completed])(
      '%s',
      (state): void => {
        let paymentId: string
        let amountDelivered: bigint
        let amountSent: bigint

        const error =
          state === PaymentState.Cancelled
            ? Pay.PaymentError.ReceiverProtocolViolation
            : undefined

        beforeEach(
          async (): Promise<void> => {
            paymentId = (
              await outgoingPaymentService.create({
                sourceAccountId,
                assetId,
                invoiceUrl: 'http://wallet.example/bob/invoices/1',
                autoApprove: true
              })
            ).id

            if (state === PaymentState.Cancelled) {
              jest
                .spyOn(Pay, 'pay')
                .mockImplementation(() =>
                  Promise.reject(Pay.PaymentError.ReceiverProtocolViolation)
                )
            }
            await processNext(paymentId, PaymentState.Ready)
            await processNext(paymentId, PaymentState.Funding)
            await fund(paymentId)
            await processNext(paymentId, PaymentState.Sending)
            const payment = await processNext(paymentId, state, error)
            expect(payment.withdrawLiquidity).toBe(true)

            amountDelivered =
              state === PaymentState.Cancelled
                ? BigInt(0)
                : invoice.amountToDeliver
            amountSent = amountDelivered * BigInt(2)
          }
        )

        it('handles liquidity withdrawal', async (): Promise<void> => {
          await withdraw(paymentId)
          const payment = await processNext(paymentId, state, error)

          await expectOutcome(payment, {
            accountBalance: BigInt(0),
            amountSent,
            amountDelivered
          })
          expect(payment.withdrawLiquidity).toBe(false)
        })

        it('endlessly wait for liquidity withdrawal', async (): Promise<void> => {
          // Even after many retries, it keeps retrying.
          for (let i = 0; i < 10; i++) {
            const payment = await processNext(paymentId, state, error)
            expect(payment.stateAttempts).toBe(i + 1)
            fastForwardToAttempt(payment.stateAttempts)
          }

          const payment = await outgoingPaymentService.get(paymentId)
          if (!payment) throw 'unreachable'
          if (!payment.quote) throw 'no quote'
          expect(payment.state).toBe(state)
          expect(payment.error).toEqual(error || null)
          expect(payment.stateAttempts).toBe(10)
          await expectOutcome(payment, {
            accountBalance: payment.quote.maxSourceAmount - amountSent, // money not yet withdrawn
            amountSent,
            amountDelivered
          })
          expect(payment.withdrawLiquidity).toBe(true)
        })

        it('not enough time between attempts', async (): Promise<void> => {
          await processNext(paymentId, state, error)
          await withdraw(paymentId)
          fastForwardToAttempt(0.9)
          // Not enough time has passed before the attempt.
          await expect(
            outgoingPaymentService.processNext()
          ).resolves.toBeUndefined()

          const payment = await outgoingPaymentService.get(paymentId)
          if (!payment) throw 'unreachable'
          expect(payment.state).toBe(state)
          expect(payment.stateAttempts).toBe(1)
          expect(payment.withdrawLiquidity).toBe(true)
          await expectOutcome(payment, {
            accountBalance: BigInt(0),
            amountSent,
            amountDelivered
          })
        })
      }
    )
  })

  describe('requote', (): void => {
    let payment: OutgoingPayment
    beforeEach(
      async (): Promise<void> => {
        payment = await outgoingPaymentService.create({
          sourceAccountId,
          assetId,
          paymentPointer: 'http://wallet.example/paymentpointer/bob',
          amountToSend: BigInt(123),
          autoApprove: false
        })
      }
    )

    it('fails when no payment exists', async (): Promise<void> => {
      await expect(outgoingPaymentService.requote(uuid())).rejects.toThrow(
        'payment does not exist'
      )
    })

    it('requotes a Cancelled payment', async (): Promise<void> => {
      await payment.$query().patch({
        state: PaymentState.Cancelled,
        error: 'Fail'
      })
      await expect(
        outgoingPaymentService.requote(payment.id)
      ).resolves.toMatchObject({
        id: payment.id,
        state: PaymentState.Inactive
      })

      const after = await outgoingPaymentService.get(payment.id)
      expect(after?.state).toBe(PaymentState.Inactive)
      expect(after?.error).toBeNull()
    })

    Object.values(PaymentState).forEach((startState) => {
      if (startState === PaymentState.Cancelled) return
      it(`does not requote a ${startState} payment`, async (): Promise<void> => {
        await payment.$query().patch({
          state: startState,
          error: 'Fail'
        })
        await expect(
          outgoingPaymentService.requote(payment.id)
        ).rejects.toThrow(`Cannot quote; payment is in state=${startState}`)

        const after = await outgoingPaymentService.get(payment.id)
        expect(after?.state).toBe(startState)
        expect(after?.error).toBe('Fail')
      })
    })
  })

  describe('approve', (): void => {
    let payment: OutgoingPayment
    beforeEach(
      async (): Promise<void> => {
        payment = await outgoingPaymentService.create({
          sourceAccountId,
          assetId,
          paymentPointer: 'http://wallet.example/paymentpointer/bob',
          amountToSend: BigInt(123),
          autoApprove: false
        })
        await processNext(payment.id, PaymentState.Ready)
      }
    )

    it('fails when no payment exists', async (): Promise<void> => {
      await expect(outgoingPaymentService.approve(uuid())).rejects.toThrow(
        'payment does not exist'
      )
    })

    it('activates a Ready payment', async (): Promise<void> => {
      await expect(
        outgoingPaymentService.approve(payment.id)
      ).resolves.toMatchObject({
        id: payment.id,
        state: PaymentState.Funding
      })

      const after = await outgoingPaymentService.get(payment.id)
      expect(after?.state).toBe(PaymentState.Funding)
    })

    Object.values(PaymentState).forEach((startState) => {
      if (startState === PaymentState.Ready) return
      it(`does not activate a ${startState} payment`, async (): Promise<void> => {
        await payment.$query().patch({ state: startState })
        await expect(
          outgoingPaymentService.approve(payment.id)
        ).rejects.toThrow(`Cannot approve; payment is in state=${startState}`)

        const after = await outgoingPaymentService.get(payment.id)
        expect(after?.state).toBe(startState)
      })
    })
  })

  describe('cancel', (): void => {
    let payment: OutgoingPayment
    beforeEach(
      async (): Promise<void> => {
        payment = await outgoingPaymentService.create({
          sourceAccountId,
          assetId,
          paymentPointer: 'http://wallet.example/paymentpointer/bob',
          amountToSend: BigInt(123),
          autoApprove: false
        })
      }
    )

    it('fails when no payment exists', async (): Promise<void> => {
      await expect(outgoingPaymentService.cancel(uuid())).rejects.toThrow(
        'payment does not exist'
      )
    })

    it('cancels a Ready payment', async (): Promise<void> => {
      await payment.$query().patch({ state: PaymentState.Ready })
      await expect(
        outgoingPaymentService.cancel(payment.id)
      ).resolves.toMatchObject({
        id: payment.id,
        state: PaymentState.Cancelled
      })

      const after = await outgoingPaymentService.get(payment.id)
      expect(after?.state).toBe(PaymentState.Cancelled)
      expect(after?.error).toBe('CancelledByAPI')
    })

    Object.values(PaymentState).forEach((startState) => {
      if (startState === PaymentState.Ready) return
      it(`does not cancel a ${startState} payment`, async (): Promise<void> => {
        await payment.$query().patch({ state: startState })
        await expect(outgoingPaymentService.cancel(payment.id)).rejects.toThrow(
          `Cannot cancel; payment is in state=${startState}`
        )

        const after = await outgoingPaymentService.get(payment.id)
        expect(after?.state).toBe(startState)
      })
    })
  })

  describe('getAccountPage', () => {
    let paymentsCreated: OutgoingPayment[]

    beforeEach(
      async (): Promise<void> => {
        paymentsCreated = []
        for (let i = 0; i < 40; i++) {
          paymentsCreated.push(
            await outgoingPaymentService.create({
              sourceAccountId,
              assetId,
              paymentPointer: 'http://wallet.example/paymentpointer/bob',
              amountToSend: BigInt(123),
              autoApprove: false
            })
          )
        }
      }
    )

    afterEach(
      async (): Promise<void> => {
        await truncateTable(knex, 'outgoingPayments')
      }
    )

    test('Defaults to fetching first 20 items', async (): Promise<void> => {
      const payments = await outgoingPaymentService.getAccountPage(
        sourceAccountId
      )
      expect(payments).toHaveLength(20)
      expect(payments[0].id).toEqual(paymentsCreated[0].id)
      expect(payments[19].id).toEqual(paymentsCreated[19].id)
      expect(payments[20]).toBeUndefined()
    })

    test('Can change forward pagination limit', async (): Promise<void> => {
      const pagination = {
        first: 10
      }
      const payments = await outgoingPaymentService.getAccountPage(
        sourceAccountId,
        pagination
      )
      expect(payments).toHaveLength(10)
      expect(payments[0].id).toEqual(paymentsCreated[0].id)
      expect(payments[9].id).toEqual(paymentsCreated[9].id)
      expect(payments[10]).toBeUndefined()
    })

    test('Can paginate forwards from a cursor', async (): Promise<void> => {
      const pagination = {
        after: paymentsCreated[19].id
      }
      const payments = await outgoingPaymentService.getAccountPage(
        sourceAccountId,
        pagination
      )
      expect(payments).toHaveLength(20)
      expect(payments[0].id).toEqual(paymentsCreated[20].id)
      expect(payments[19].id).toEqual(paymentsCreated[39].id)
      expect(payments[20]).toBeUndefined()
    })

    test('Can paginate forwards from a cursor with a limit', async (): Promise<void> => {
      const pagination = {
        first: 10,
        after: paymentsCreated[9].id
      }
      const payments = await outgoingPaymentService.getAccountPage(
        sourceAccountId,
        pagination
      )
      expect(payments).toHaveLength(10)
      expect(payments[0].id).toEqual(paymentsCreated[10].id)
      expect(payments[9].id).toEqual(paymentsCreated[19].id)
      expect(payments[10]).toBeUndefined()
    })

    test("Can't change backward pagination limit on it's own.", async (): Promise<void> => {
      const pagination = {
        last: 10
      }
      const payments = outgoingPaymentService.getAccountPage(
        sourceAccountId,
        pagination
      )
      await expect(payments).rejects.toThrow(
        "Can't paginate backwards from the start."
      )
    })

    test('Can paginate backwards from a cursor', async (): Promise<void> => {
      const pagination = {
        before: paymentsCreated[20].id
      }
      const payments = await outgoingPaymentService.getAccountPage(
        sourceAccountId,
        pagination
      )
      expect(payments).toHaveLength(20)
      expect(payments[0].id).toEqual(paymentsCreated[0].id)
      expect(payments[19].id).toEqual(paymentsCreated[19].id)
      expect(payments[20]).toBeUndefined()
    })

    test('Can paginate backwards from a cursor with a limit', async (): Promise<void> => {
      const pagination = {
        last: 5,
        before: paymentsCreated[10].id
      }
      const payments = await outgoingPaymentService.getAccountPage(
        sourceAccountId,
        pagination
      )
      expect(payments).toHaveLength(5)
      expect(payments[0].id).toEqual(paymentsCreated[5].id)
      expect(payments[4].id).toEqual(paymentsCreated[9].id)
      expect(payments[5]).toBeUndefined()
    })

    test('Backwards/Forwards pagination results in same order.', async (): Promise<void> => {
      const paginationForwards = {
        first: 10
      }
      const paymentsForwards = await outgoingPaymentService.getAccountPage(
        sourceAccountId,
        paginationForwards
      )
      const paginationBackwards = {
        last: 10,
        before: paymentsCreated[10].id
      }
      const paymentsBackwards = await outgoingPaymentService.getAccountPage(
        sourceAccountId,
        paginationBackwards
      )
      expect(paymentsForwards).toHaveLength(10)
      expect(paymentsBackwards).toHaveLength(10)
      expect(paymentsForwards).toEqual(paymentsBackwards)
    })

    test('Providing before and after results in forward pagination', async (): Promise<void> => {
      const pagination = {
        after: paymentsCreated[19].id,
        before: paymentsCreated[19].id
      }
      const payments = await outgoingPaymentService.getAccountPage(
        sourceAccountId,
        pagination
      )
      expect(payments).toHaveLength(20)
      expect(payments[0].id).toEqual(paymentsCreated[20].id)
      expect(payments[19].id).toEqual(paymentsCreated[39].id)
      expect(payments[20]).toBeUndefined()
    })

    test("Can't request less than 0 payments", async (): Promise<void> => {
      const pagination = {
        first: -1
      }
      const payments = outgoingPaymentService.getAccountPage(
        sourceAccountId,
        pagination
      )
      await expect(payments).rejects.toThrow('Pagination index error')
    })

    test("Can't request more than 100 payments", async (): Promise<void> => {
      const pagination = {
        first: 101
      }
      const payments = outgoingPaymentService.getAccountPage(
        sourceAccountId,
        pagination
      )
      await expect(payments).rejects.toThrow('Pagination index error')
    })
  })
})
