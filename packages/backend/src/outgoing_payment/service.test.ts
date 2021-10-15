import assert from 'assert'
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
import { truncateTables } from '../tests/tableManager'
import { OutgoingPayment, PaymentIntent, PaymentState } from './model'
import { MockPlugin } from './mock_plugin'
import { LifecycleError } from './lifecycle'
import { RETRY_BACKOFF_SECONDS } from './worker'
import { AccountService } from '../account/service'
import { BalanceService, Balance } from '../balance/service'
import { RatesService } from '../rates/service'
import { TransferService } from '../transfer/service'
import { TransferError } from '../transfer/errors'
import { LiquidityService } from '../liquidity/service'

describe('OutgoingPaymentService', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let outgoingPaymentService: OutgoingPaymentService
  let ratesService: RatesService
  let accountService: AccountService
  let balanceService: BalanceService
  let transferService: TransferService
  let liquidityService: LiquidityService
  let knex: Knex
  let sourceAccountId: string
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
    expectState?: PaymentState
  ): Promise<OutgoingPayment> {
    await expect(outgoingPaymentService.processNext()).resolves.toBe(paymentId)
    const payment = await outgoingPaymentService.get(paymentId)
    if (!payment) throw 'no payment'
    if (expectState) expect(payment.state).toBe(expectState)
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

  async function expectOutcome(
    payment: OutgoingPayment,
    {
      amountSent,
      amountDelivered,
      sourceAccountBalance,
      accountBalance,
      invoiceReceived
    }: {
      amountSent?: bigint
      amountDelivered?: bigint
      sourceAccountBalance?: bigint
      accountBalance?: bigint
      invoiceReceived?: bigint
    }
  ) {
    if (amountSent !== undefined) {
      const balance = await accountService.getBalance(payment.accountId)
      expect(balance).toBeDefined()
      if (balance === undefined) {
        fail()
      }
      const reservedBalance = await balanceService.get(
        payment.reservedBalanceId
      )
      expect(reservedBalance).toBeDefined()
      if (!reservedBalance) {
        fail()
      }
      expect(reservedBalance.balance - balance).toBe(amountSent)
    }
    if (amountDelivered !== undefined) {
      expect(plugins[payment.accountId].totalReceived).toBe(amountDelivered)
    }
    if (sourceAccountBalance !== undefined) {
      await expect(
        accountService.getBalance(payment.sourceAccount.id)
      ).resolves.toEqual(sourceAccountBalance)
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
      liquidityService = await deps.use('liquidityService')
      deps.bind('makeIlpPlugin', async (_deps) => (accountId: string) =>
        (plugins[accountId] =
          plugins[accountId] ||
          new MockPlugin({
            streamServer,
            exchangeRate: 0.5,
            accountId,
            accountService,
            liquidityService,
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
      balanceService = await deps.use('balanceService')
      transferService = await deps.use('transferService')
      const accountFactory = new AccountFactory(accountService, transferService)
      sourceAccountId = (
        await accountFactory.build({
          asset: {
            scale: 9,
            code: 'USD'
          },
          balance: BigInt(200)
        })
      ).id
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
      expect(payment.sourceAccount.id).toBe(sourceAccountId)
      await expectOutcome(payment, { accountBalance: BigInt(0) })
      expect(payment.sourceAccount.code).toBe('USD')
      expect(payment.sourceAccount.scale).toBe(9)
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
        invoiceUrl: 'http://wallet.example/bob/invoices/1',
        autoApprove: false
      })
      expect(payment.state).toEqual(PaymentState.Inactive)
      expect(payment.intent).toEqual({
        invoiceUrl: 'http://wallet.example/bob/invoices/1',
        autoApprove: false
      })
      expect(payment.sourceAccount.id).toBe(sourceAccountId)
      await expectOutcome(payment, { accountBalance: BigInt(0) })
      expect(payment.sourceAccount.code).toBe('USD')
      expect(payment.sourceAccount.scale).toBe(9)
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
          invoiceUrl: 'http://wallet.example/bob/invoices/1',
          amountToSend: BigInt(123),
          autoApprove: false
        })
      ).rejects.toThrow(
        'invoiceUrl and (paymentPointer,amountToSend) are mutually exclusive'
      )
    })

    it('fails to create with nonexistent source account', async () => {
      await expect(
        outgoingPaymentService.create({
          sourceAccountId: uuid(),
          paymentPointer: 'http://wallet.example/paymentpointer/bob',
          amountToSend: BigInt(123),
          autoApprove: false
        })
      ).rejects.toThrow('outgoing payment source account does not exist')
    })
  })

  describe('processNext', (): void => {
    describe('Inactive→', (): void => {
      it('Ready (FixedSend)', async (): Promise<void> => {
        const paymentId = (
          await outgoingPaymentService.create({
            sourceAccountId,
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
            paymentPointer: 'http://wallet.example/paymentpointer/bob',
            amountToSend: BigInt(123),
            autoApprove: false
          })
        ).id
        const payment = await processNext(paymentId, PaymentState.Inactive)

        expect(payment.stateAttempts).toBe(1)
        expect(payment.error).toBeNull()
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
          paymentPointer: 'http://wallet.example/paymentpointer/bob',
          amountToSend: BigInt(123),
          autoApprove: false
        })
        jest
          .spyOn(accountService, 'getBalance')
          .mockImplementation(async (id: string) => {
            expect(id).toBe(payment.accountId)
            return BigInt(0)
          })
        jest
          .spyOn(balanceService, 'get')
          .mockImplementation(async (id: string) => {
            expect(id).toStrictEqual(payment.reservedBalanceId)
            return {
              balance: BigInt(89)
            } as Balance
          })
        const payment2 = await processNext(payment.id, PaymentState.Ready)
        expect(payment2.quote?.maxSourceAmount).toBe(BigInt(123 - 89))
      })

      // This mocks Inactive→Completed, but for it to trigger for real, it would go from Sending→Inactive(retry)→Completed (when the Sending→Completed transition failed to commit).
      it('Completed (FixedSend, intent.amountToSend===amountSent)', async (): Promise<void> => {
        const payment = await outgoingPaymentService.create({
          sourceAccountId,
          paymentPointer: 'http://wallet.example/paymentpointer/bob',
          amountToSend: BigInt(123),
          autoApprove: false
        })
        jest
          .spyOn(accountService, 'getBalance')
          .mockImplementation(async (id: string) => {
            expect(id).toBe(payment.accountId)
            return BigInt(0)
          })
        jest
          .spyOn(balanceService, 'get')
          .mockImplementation(async (id: string) => {
            expect(id).toStrictEqual(payment.reservedBalanceId)
            return {
              balance: BigInt(123)
            } as Balance
          })
        await processNext(payment.id, PaymentState.Completed)
      })

      // Maybe another person or payment paid the invoice already. Or it could be like the FixedSend case, where the Sending→Completed transition failed to commit, and this is a retry.
      it('Completed (FixedDelivery, invoice was already full paid)', async (): Promise<void> => {
        invoice.amountDelivered = invoice.amountToDeliver
        const paymentId = (
          await outgoingPaymentService.create({
            sourceAccountId,
            invoiceUrl: 'http://wallet.example/bob/invoices/1',
            autoApprove: false
          })
        ).id
        await processNext(paymentId, PaymentState.Completed)
      })

      it('Cancelling (destination asset changed)', async (): Promise<void> => {
        const originalPayment = await outgoingPaymentService.create({
            sourceAccountId,
            paymentPointer: 'http://wallet.example/paymentpointer/bob',
            amountToSend: BigInt(123),
            autoApprove: false
          })
        const paymentId = originalPayment.id
        // Pretend that the destination asset was initially different.
        await OutgoingPayment.query(knex)
          .findById(paymentId)
          .patch({
            destinationAccount: Object.assign({}, originalPayment.destinationAccount, {
              scale: 55,
            })
          })

        const payment = await processNext(paymentId, PaymentState.Cancelling)
        expect(payment.error).toBe(Pay.PaymentError.DestinationAssetConflict)
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
            paymentPointer: 'http://wallet.example/paymentpointer/bob',
            amountToSend: BigInt(123),
            autoApprove
          })
        ).id
        await processNext(paymentId, PaymentState.Ready)
        return paymentId
      }

      it('Cancelling (quote expired; autoApprove=false)', async (): Promise<void> => {
        const paymentId = await setup({ autoApprove: false })
        jest.useFakeTimers('modern')
        jest.advanceTimersByTime(config.quoteLifespan + 1)

        const payment = await processNext(paymentId, PaymentState.Cancelling)
        expect(payment.error).toBe(LifecycleError.QuoteExpired)
      })

      it('Ready (autoApprove=false)', async (): Promise<void> => {
        await setup({ autoApprove: false })
        // (no change)
        await expect(
          outgoingPaymentService.processNext()
        ).resolves.toBeUndefined()
      })

      it('Activated (autoApprove=true)', async (): Promise<void> => {
        const paymentId = await setup({ autoApprove: true })
        await processNext(paymentId, PaymentState.Activated)
      })
    })

    describe('Activated→', (): void => {
      let paymentId: string

      beforeEach(
        async (): Promise<void> => {
          paymentId = (
            await outgoingPaymentService.create({
              sourceAccountId,
              paymentPointer: 'http://wallet.example/paymentpointer/bob',
              amountToSend: BigInt(123),
              autoApprove: true
            })
          ).id
          await processNext(paymentId, PaymentState.Ready)
          await processNext(paymentId, PaymentState.Activated)
        }
      )

      it('Cancelling (quote expired)', async (): Promise<void> => {
        jest.useFakeTimers('modern')
        jest.advanceTimersByTime(config.quoteLifespan + 1)

        const payment = await processNext(paymentId, PaymentState.Cancelling)
        expect(payment.error).toBe(LifecycleError.QuoteExpired)
      })

      it('Cancelling (insufficient balance)', async (): Promise<void> => {
        const sourceAccount = await accountService.get(sourceAccountId)
        assert(sourceAccount)
        await expect(
          liquidityService.createWithdrawal({
            id: uuid(),
            account: sourceAccount,
            amount: BigInt(100)
          })
        ).resolves.toBeUndefined()

        const payment = await processNext(paymentId, PaymentState.Cancelling)
        expect(payment.error).toBe(LifecycleError.InsufficientBalance)
      })

      it('Cancelling (account service error)', async (): Promise<void> => {
        jest.spyOn(transferService, 'create').mockImplementation(async () => ({
          index: 0,
          error: TransferError.SameBalances
        }))

        const payment = await processNext(paymentId, PaymentState.Cancelling)
        expect(payment.error).toBe(LifecycleError.AccountServiceError)
      })

      it('Sending (money is reserved)', async (): Promise<void> => {
        const payment = await processNext(paymentId, PaymentState.Sending)
        if (!payment.quote) throw 'no quote'
        await expectOutcome(payment, {
          sourceAccountBalance: BigInt(200) - payment.quote.maxSourceAmount,
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
            autoApprove: true,
            ...opts
          })
        ).id
        await processNext(paymentId, PaymentState.Ready)
        await processNext(paymentId, PaymentState.Activated)
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
          sourceAccountBalance: BigInt(200 - 123),
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
        await expectOutcome(payment, {
          sourceAccountBalance:
            BigInt(200) - invoice.amountToDeliver * BigInt(2),
          accountBalance: BigInt(0),
          amountSent: invoice.amountToDeliver * BigInt(2),
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
        await expectOutcome(payment, {
          sourceAccountBalance:
            BigInt(200) -
            (invoice.amountToDeliver - amountAlreadyDelivered) * BigInt(2),
          accountBalance: BigInt(0),
          amountSent:
            (invoice.amountToDeliver - amountAlreadyDelivered) * BigInt(2),
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
          expect(payment.state).toBe(PaymentState.Sending)
          expect(payment.error).toBeNull()
          expect(payment.stateAttempts).toBe(i + 1)
          await expectOutcome(payment, {
            amountSent: BigInt(10 * (i + 1)),
            amountDelivered: BigInt(5 * (i + 1))
          })
          // Skip through the backoff timer.
          fastForwardToAttempt(payment.stateAttempts)
        }
        // Last attempt fails, but no more retries.
        const payment = await processNext(paymentId, PaymentState.Cancelling)
        expect(payment.error).toBe('ClosedByReceiver')
        expect(payment.stateAttempts).toBe(0)
        // "mockPay" allows a small amount of money to be paid every attempt.
        await expectOutcome(payment, {
          sourceAccountBalance: BigInt(200 - 123), // not restored yet
          accountBalance: BigInt(123 - 10 * 5),
          amountSent: BigInt(10 * 5),
          amountDelivered: BigInt(5 * 5)
        })
      })

      it('Cancelling (non-retryable Pay error)', async (): Promise<void> => {
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

        const payment = await processNext(paymentId, PaymentState.Cancelling)
        expect(payment.error).toBe('ReceiverProtocolViolation')
        await expectOutcome(payment, {
          sourceAccountBalance: BigInt(200 - 123),
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
          sourceAccountBalance: BigInt(200 - 123),
          accountBalance: BigInt(123 - 10),
          amountSent: BigInt(10),
          amountDelivered: BigInt(5)
        })

        // The next attempt is without the mock, so it succeeds.
        const payment2 = await processNext(paymentId, PaymentState.Completed)
        await expectOutcome(payment2, {
          sourceAccountBalance: BigInt(200) - amountToSend,
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
          sourceAccountBalance: BigInt(200 - 123),
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
        await expectOutcome(payment, {
          sourceAccountBalance: BigInt(200),
          accountBalance: BigInt(0),
          amountSent: BigInt(0),
          amountDelivered: BigInt(0),
          invoiceReceived: invoice.amountToDeliver
        })
      })

      it('Cancelling (destination asset changed)', async (): Promise<void> => {
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
              scale: 55,
            }
          })

        const payment = await processNext(paymentId, PaymentState.Cancelling)
        expect(payment.error).toBe(Pay.PaymentError.DestinationAssetConflict)
      })
    })

    describe('Cancelling→', (): void => {
      let paymentId: string
      beforeEach(
        async (): Promise<void> => {
          paymentId = (
            await outgoingPaymentService.create({
              sourceAccountId,
              paymentPointer: 'http://wallet.example/paymentpointer/bob',
              amountToSend: BigInt(123),
              autoApprove: true
            })
          ).id

          jest
            .spyOn(Pay, 'pay')
            .mockImplementation(() =>
              Promise.reject(Pay.PaymentError.InvoiceAlreadyPaid)
            )
          await processNext(paymentId, PaymentState.Ready)
          await processNext(paymentId, PaymentState.Activated)
          await processNext(paymentId, PaymentState.Sending)
          await processNext(paymentId, PaymentState.Cancelling)
        }
      )

      it('Cancelled (from Sending; restore reserved funds)', async (): Promise<void> => {
        const payment = await processNext(paymentId, PaymentState.Cancelled)

        expect(payment.error).toBe('InvoiceAlreadyPaid')
        await expectOutcome(payment, {
          sourceAccountBalance: BigInt(200),
          accountBalance: BigInt(0),
          amountSent: BigInt(0),
          amountDelivered: BigInt(0)
        })
      })

      it('Cancelling (endlessly cancel when refund fails after non-retryable send error)', async (): Promise<void> => {
        jest.spyOn(transferService, 'create').mockImplementation(async () => ({
          index: 0,
          error: TransferError.SameBalances
        }))

        // Even after many retries, if Cancelling fails it keeps retrying.
        for (let i = 0; i < 10; i++) {
          const payment = await processNext(paymentId, PaymentState.Cancelling)
          expect(payment.stateAttempts).toBe(i + 1)
          fastForwardToAttempt(payment.stateAttempts)
        }

        const payment = await outgoingPaymentService.get(paymentId)
        if (!payment) throw 'unreachable'
        expect(payment.state).toBe(PaymentState.Cancelling)
        expect(payment.error).toBe('InvoiceAlreadyPaid')
        expect(payment.stateAttempts).toBe(10)
        await expectOutcome(payment, {
          sourceAccountBalance: BigInt(200 - 123), // reverting money failed
          accountBalance: BigInt(123),
          amountSent: BigInt(0),
          amountDelivered: BigInt(0)
        })
      })

      it('Cancelling (not enough time between attempts)', async (): Promise<void> => {
        jest.spyOn(transferService, 'create').mockImplementation(async () => ({
          index: 0,
          error: TransferError.SameBalances
        }))

        await processNext(paymentId, PaymentState.Cancelling)
        fastForwardToAttempt(0.9)
        // Not enough time has passed before the attempt.
        await expect(
          outgoingPaymentService.processNext()
        ).resolves.toBeUndefined()

        const payment = await outgoingPaymentService.get(paymentId)
        if (!payment) throw 'unreachable'
        expect(payment.state).toBe(PaymentState.Cancelling)
        expect(payment.stateAttempts).toBe(1)
        await expectOutcome(payment, {
          sourceAccountBalance: BigInt(200 - 123), // reverting money failed
          accountBalance: BigInt(123),
          amountSent: BigInt(0),
          amountDelivered: BigInt(0)
        })
      })
    })
  })

  describe('requote', (): void => {
    let payment: OutgoingPayment
    beforeEach(
      async (): Promise<void> => {
        payment = await outgoingPaymentService.create({
          sourceAccountId,
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
        state: PaymentState.Activated
      })

      const after = await outgoingPaymentService.get(payment.id)
      expect(after?.state).toBe(PaymentState.Activated)
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
        state: PaymentState.Cancelling
      })

      const after = await outgoingPaymentService.get(payment.id)
      expect(after?.state).toBe(PaymentState.Cancelling)
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
})
