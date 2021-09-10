import nock from 'nock'
import Knex from 'knex'
import * as Pay from '@interledger/pay'
import { StreamServer, StreamCredentials } from '@interledger/stream-receiver'
import { RatesService } from 'rates'
import { v4 as uuid } from 'uuid'

import { OutgoingPaymentService } from './service'
import { createTestApp, TestContainer } from '../tests/app'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'
import { truncateTables } from '../tests/tableManager'
import { MockConnectorService } from '../tests/mockConnectorService'
import { OutgoingPayment, PaymentIntent, PaymentState } from './model'
import { MockPlugin } from './mock_plugin'
import { LifecycleError } from './lifecycle'
import { RETRY_BACKOFF_SECONDS } from './worker'
import { PaymentProgressService } from '../payment_progress/service'
import { CreditError } from '../connector/generated/graphql'
import { createAccountService } from '../account/service'

describe('OutgoingPaymentService', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let outgoingPaymentService: OutgoingPaymentService
  let paymentProgressService: PaymentProgressService
  let ratesService: RatesService
  let connectorService: MockConnectorService
  let knex: Knex
  let superAccountId: string
  let credentials: StreamCredentials
  let plugins: { [sourceAccount: string]: MockPlugin } = {}

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

  function fastForwardToAttempt(stateAttempts: number): void {
    jest
      .spyOn(Date, 'now')
      .mockReturnValue(
        Date.now() + stateAttempts * RETRY_BACKOFF_SECONDS * 1000
      )
  }

  beforeAll(
    async (): Promise<void> => {
      connectorService = new MockConnectorService()
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
      deps.bind('makeIlpPlugin', async (_deps) => (sourceAccount: string) =>
        (plugins[sourceAccount] =
          plugins[sourceAccount] ||
          new MockPlugin({
            streamServer,
            exchangeRate: 0.5,
            sourceAccount,
            connectorService
          }))
      )
      deps.bind('connectorService', async (_deps) => connectorService)
      deps.bind('ratesService', async (_deps) => ratesService)
      knex = await deps.use('knex')
      deps.bind('accountService', async (deps) =>
        createAccountService({
          logger: await deps.use('logger'),
          knex,
          connectorService
        })
      )
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
      const accountService = await deps.use('accountService')
      outgoingPaymentService = await deps.use('outgoingPaymentService')
      paymentProgressService = await deps.use('paymentProgressService')
      superAccountId = (await accountService.create(9, 'USD')).id
      connectorService.setAccountBalance(superAccountId, BigInt(200))

      nock('http://wallet.example')
        .get('/paymentpointer/bob')
        .reply(200, {
          destination_account: credentials.ilpAddress,
          shared_secret: credentials.sharedSecret.toString('base64')
        })
        .persist()
        .get('/bob/invoices/1')
        .reply(200, {
          id: 'http://wallet.example/bob/invoices/1',
          account: 'http://wallet.example/bob',
          amount: 56,
          assetCode: 'XRP',
          assetScale: 9,
          description: 'description!',
          received: 0,
          expiresAt: new Date(Date.now() + 60 * 1000).toISOString(),
          ilpAddress: credentials.ilpAddress,
          sharedSecret: credentials.sharedSecret.toString('base64')
        })
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
    it('creates an OutgoingPayment', async () => {
      const payment = await outgoingPaymentService.create({
        superAccountId,
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
      expect(payment.superAccountId).toBe(superAccountId)
      await expect(
        connectorService.getAccountBalance(payment.sourceAccount.id)
      ).resolves.toEqual({ balance: BigInt(0) })
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
  })

  describe('processNext', (): void => {
    describe('Inactive→', (): void => {
      it('Ready (FixedSend)', async (): Promise<void> => {
        const paymentId = (
          await outgoingPaymentService.create({
            superAccountId,
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
        expect(payment.quote.targetType).toBe(Pay.PaymentType.FixedSend)
        expect(payment.quote.minDeliveryAmount).toBe(
          BigInt(Math.ceil(123 * payment.quote.minExchangeRate.valueOf()))
        )
        expect(payment.quote.maxSourceAmount).toBe(BigInt(123))
        expect(payment.quote.maxPacketAmount).toBe(
          BigInt('9223372036854775807')
        )
        expect(payment.quote.minExchangeRate.valueOf()).toBe(
          0.5 * (1 - Config.slippage)
        )
        expect(payment.quote.lowExchangeRateEstimate.valueOf()).toBe(0.5)
        expect(payment.quote.highExchangeRateEstimate.valueOf()).toBe(0.5)
      })

      it('Ready (FixedDelivery)', async (): Promise<void> => {
        const paymentId = (
          await outgoingPaymentService.create({
            superAccountId,
            invoiceUrl: 'http://wallet.example/bob/invoices/1',
            autoApprove: false
          })
        ).id
        const payment = await processNext(paymentId, PaymentState.Ready)
        if (!payment.quote) throw 'no quote'
        expect(payment.quote.targetType).toBe(Pay.PaymentType.FixedDelivery)
        expect(payment.quote.minDeliveryAmount).toBe(BigInt(56))
        expect(payment.quote.maxSourceAmount).toBe(
          BigInt(Math.ceil(56 * 2 * (1 + Config.slippage)))
        )
        expect(payment.quote.minExchangeRate.valueOf()).toBe(
          0.5 * (1 - Config.slippage)
        )
        expect(payment.quote.lowExchangeRateEstimate.valueOf()).toBe(0.5)
        expect(payment.quote.highExchangeRateEstimate.valueOf()).toBe(0.5)
      })

      it('Inactive (rate service error)', async (): Promise<void> => {
        jest
          .spyOn(ratesService, 'prices')
          .mockImplementation(() => Promise.reject(new Error('fail')))

        const paymentId = (
          await outgoingPaymentService.create({
            superAccountId,
            paymentPointer: 'http://wallet.example/paymentpointer/bob',
            amountToSend: BigInt(123),
            autoApprove: false
          })
        ).id
        const payment = await processNext(paymentId, PaymentState.Inactive)
        expect(payment.stateAttempts).toBe(1)
        expect(payment.error).toBeNull()
        expect(payment.quote).toBeUndefined()
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
            superAccountId,
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
        jest.advanceTimersByTime(Config.quoteLifespan + 1)

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
              superAccountId,
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
        jest.advanceTimersByTime(Config.quoteLifespan + 1)
        const payment = await processNext(paymentId, PaymentState.Cancelling)
        expect(payment.error).toBe(LifecycleError.QuoteExpired)
      })

      it('Cancelling (insufficient balance)', async (): Promise<void> => {
        connectorService.setAccountBalance(superAccountId, BigInt(100))
        const payment = await processNext(paymentId, PaymentState.Cancelling)
        expect(payment.error).toBe(LifecycleError.InsufficientBalance)
      })

      it('Cancelling (account service error)', async (): Promise<void> => {
        jest
          .spyOn(connectorService, 'extendCredit')
          .mockImplementation(async () => ({
            success: false,
            code: '400',
            message: 'fail',
            error: CreditError.SameAccounts
          }))
        const payment = await processNext(paymentId, PaymentState.Cancelling)
        expect(payment.error).toBe(LifecycleError.AccountServiceError)
      })

      it('Sending', async (): Promise<void> => {
        const payment = await processNext(paymentId, PaymentState.Sending)
        if (!payment.quote) throw 'no quote'
        await expect(
          connectorService.getAccountBalance(payment.sourceAccount.id)
        ).resolves.toEqual({ balance: BigInt(payment.quote.maxSourceAmount) })
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
            superAccountId,
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

        if (!payment.outcome) throw 'no outcome'
        expect(payment.outcome.amountSent).toBe(payment.quote?.maxSourceAmount)
        expect(payment.outcome.amountDelivered).toBe(
          payment.quote?.minDeliveryAmount
        )
        expect(plugins[payment.sourceAccount.id].totalReceived).toBe(
          payment.outcome.amountDelivered
        )

        const progress = await paymentProgressService.get(paymentId)
        if (!progress) throw 'no payment progress'
        expect(progress.amountSent).toBe(payment.outcome.amountSent)
        expect(progress.amountDelivered).toBe(payment.outcome.amountDelivered)

        await expect(
          connectorService.getAccountBalance(payment.sourceAccount.id)
        ).resolves.toEqual({ balance: BigInt(0) })
        await expect(
          connectorService.getAccountBalance(superAccountId)
        ).resolves.toEqual({
          balance: BigInt(200) - payment.outcome.amountSent
        })
      })

      it('Completed (FixedDelivery)', async (): Promise<void> => {
        const paymentId = await setup({
          invoiceUrl: 'http://wallet.example/bob/invoices/1'
        })
        const payment = await processNext(paymentId, PaymentState.Completed)

        if (!payment.quote) throw 'no quote'
        if (!payment.outcome) throw 'no outcome'
        expect(payment.outcome.amountSent).toBe(
          payment.quote.minDeliveryAmount * BigInt(2)
        )
        expect(payment.outcome.amountDelivered).toBe(
          payment.quote.minDeliveryAmount
        )
        expect(plugins[payment.sourceAccount.id].totalReceived).toBe(
          payment.outcome.amountDelivered
        )

        const progress = await paymentProgressService.get(paymentId)
        if (!progress) throw 'no payment progress'
        expect(progress.amountSent).toBe(payment.outcome.amountSent)
        expect(progress.amountDelivered).toBe(payment.outcome.amountDelivered)

        // The leftover money (56*2*slippage USD) has been refunded to the parent account.
        await expect(
          connectorService.getAccountBalance(payment.sourceAccount.id)
        ).resolves.toEqual({ balance: BigInt(0) })
        await expect(
          connectorService.getAccountBalance(superAccountId)
        ).resolves.toEqual({
          balance: BigInt(200) - payment.outcome.amountSent
        })
      })

      it('Completed (resume from full payment with failed commit)', async (): Promise<void> => {
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

        expect(payment.outcome?.amountSent).toBe(payment.quote?.maxSourceAmount)
        expect(payment.outcome?.amountDelivered).toBe(
          payment.quote?.minDeliveryAmount
        )
        // The retry doesn't pay anything (this is the retry's plugin).
        expect(plugins[payment.sourceAccount.id].totalReceived).toBe(
          payment.quote?.minDeliveryAmount
        )
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
          // Skip through the backoff timer.
          fastForwardToAttempt(payment.stateAttempts)
        }
        // Last attempt fails, but no more retries.
        const payment = await processNext(paymentId, PaymentState.Cancelling)
        expect(payment.error).toBe('ClosedByReceiver')
        expect(payment.stateAttempts).toBe(0)
        // "mockPay" allows a small amount of money to be paid every attempt.
        expect(payment.outcome?.amountSent).toBe(BigInt(10 * 5))
        expect(payment.outcome?.amountDelivered).toBe(BigInt(5 * 5))
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
        expect(payment.outcome?.amountSent).toBe(BigInt(10))
        expect(payment.outcome?.amountDelivered).toBe(BigInt(5))
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
        await processNext(paymentId, PaymentState.Sending)
        mockFn.mockRestore()
        fastForwardToAttempt(1)
        // The next attempt is without the mock, so it succeeds.
        const payment = await processNext(paymentId, PaymentState.Completed)

        expect(payment.outcome?.amountSent).toBe(amountToSend)
        expect(payment.outcome?.amountDelivered).toBe(amountToSend / BigInt(2))

        await expect(
          connectorService.getAccountBalance(superAccountId)
        ).resolves.toEqual({
          balance: BigInt(200) - amountToSend
        })
      })

      it('Sending (progress update fails)', async (): Promise<void> => {
        jest
          .spyOn(paymentProgressService, 'increase')
          .mockImplementation(() => Promise.reject(new Error('sql error')))
        const paymentId = await setup({
          paymentPointer: 'http://wallet.example/paymentpointer/bob',
          amountToSend: BigInt(123)
        })
        const payment = await processNext(paymentId, PaymentState.Sending)
        expect(payment.stateAttempts).toBe(1)
      })
    })

    describe('Cancelling→', (): void => {
      let paymentId: string
      beforeEach(
        async (): Promise<void> => {
          paymentId = (
            await outgoingPaymentService.create({
              superAccountId,
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
        expect(payment.outcome?.amountSent).toBe(BigInt(0))
        expect(payment.outcome?.amountDelivered).toBe(BigInt(0))
        // All reserved money was refunded.
        await expect(
          connectorService.getAccountBalance(superAccountId)
        ).resolves.toEqual({ balance: BigInt(200) })
      })

      it('Cancelling (endlessly cancel when refund fails after non-retryable send error)', async (): Promise<void> => {
        jest
          .spyOn(connectorService, 'settleDebt')
          .mockImplementation(() =>
            Promise.reject(new Error('account service error'))
          )
        // Even after many retries, if Cancelling fails it keeps retrying.
        for (let i = 0; i < 10; i++) {
          const payment = await processNext(paymentId, PaymentState.Cancelling)
          expect(payment.stateAttempts).toBe(i + 1)
          fastForwardToAttempt(payment.stateAttempts)
        }

        const payment = await OutgoingPayment.query(knex).findById(paymentId)
        expect(payment.state).toBe(PaymentState.Cancelling)
        expect(payment.error).toBe('InvoiceAlreadyPaid')
        expect(payment.stateAttempts).toBe(10)
      })

      it('Cancelling (not enough time between attempts)', async (): Promise<void> => {
        jest
          .spyOn(connectorService, 'settleDebt')
          .mockImplementation(() =>
            Promise.reject(new Error('account service error'))
          )
        await processNext(paymentId, PaymentState.Cancelling)
        fastForwardToAttempt(0.9)
        // Not enough time has passed before the attempt.
        await expect(
          outgoingPaymentService.processNext()
        ).resolves.toBeUndefined()

        const payment = await OutgoingPayment.query(knex).findById(paymentId)
        expect(payment.state).toBe(PaymentState.Cancelling)
        expect(payment.stateAttempts).toBe(1)
      })
    })
  })

  describe('requote', (): void => {
    let payment: OutgoingPayment
    beforeEach(
      async (): Promise<void> => {
        payment = await outgoingPaymentService.create({
          superAccountId,
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

      const after = await OutgoingPayment.query(knex).findById(payment.id)
      expect(after.state).toBe(PaymentState.Inactive)
      expect(after.error).toBeNull()
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

        const after = await OutgoingPayment.query(knex).findById(payment.id)
        expect(after.state).toBe(startState)
        expect(after.error).toBe('Fail')
      })
    })
  })

  describe('approve', (): void => {
    let payment: OutgoingPayment
    beforeEach(
      async (): Promise<void> => {
        payment = await outgoingPaymentService.create({
          superAccountId,
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

      const after = await OutgoingPayment.query(knex).findById(payment.id)
      expect(after.state).toBe(PaymentState.Activated)
    })

    Object.values(PaymentState).forEach((startState) => {
      if (startState === PaymentState.Ready) return
      it(`does not activate a ${startState} payment`, async (): Promise<void> => {
        await payment.$query().patch({ state: startState })
        await expect(
          outgoingPaymentService.approve(payment.id)
        ).rejects.toThrow(`Cannot approve; payment is in state=${startState}`)

        const after = await OutgoingPayment.query(knex).findById(payment.id)
        expect(after.state).toBe(startState)
      })
    })
  })

  describe('cancel', (): void => {
    let payment: OutgoingPayment
    beforeEach(
      async (): Promise<void> => {
        payment = await outgoingPaymentService.create({
          superAccountId,
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

      const after = await OutgoingPayment.query(knex).findById(payment.id)
      expect(after.state).toBe(PaymentState.Cancelling)
      expect(after.error).toBe('CancelledByAPI')
    })

    Object.values(PaymentState).forEach((startState) => {
      if (startState === PaymentState.Ready) return
      it(`does not cancel a ${startState} payment`, async (): Promise<void> => {
        await payment.$query().patch({ state: startState })
        await expect(outgoingPaymentService.cancel(payment.id)).rejects.toThrow(
          `Cannot cancel; payment is in state=${startState}`
        )

        const after = await OutgoingPayment.query(knex).findById(payment.id)
        expect(after.state).toBe(startState)
      })
    })
  })
})
